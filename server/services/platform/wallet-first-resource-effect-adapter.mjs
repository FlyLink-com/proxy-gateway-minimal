import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  snapshotWalletFirstSetupDeliveryRuntimeEscrow
} from "./wallet-first-setup-delivery-escrow.mjs";

export const WALLET_FIRST_RESOURCE_EFFECT_ADAPTER_IDEMPOTENCY_CONTRACT =
  "deduplicate_by_transition_ref";
export const WALLET_FIRST_RESOURCE_EFFECT_CONTROL_ADAPTER_CONTRACT =
  "wallet-first-resource-effect-control-adapter/v1";
export const WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_ADAPTER_CONTRACT =
  "wallet-first-resource-effect-runtime-adapter/v1";

const FACTORY_FIELDS = Object.freeze([
  "controlStore",
  "subscriptionCore",
  "nodeId",
  "nowFn"
]);
const OPTIONAL_FACTORY_FIELDS = Object.freeze([
  "setupDeliveryRuntimeEscrow"
]);
const CONTROL_STORE_METHODS = Object.freeze([
  "getWalletFirstAccountForDeferredTransition",
  "resolveExactWalletFirstResourceChainForDeferredTransition",
  "getWalletFirstTransitionEffectForDeferredTransition",
  "prepareWalletFirstInitialActivationForDeferredTransition",
  "prepareWalletFirstScheduledSwitchForDeferredTransition",
  "getWalletFirstRuntimeReceiptForDeferredTransition",
  "verifyWalletFirstRuntimeTransitionForDeferredTransition",
  "claimWalletFirstRuntimeEffectForDeferredTransition",
  "markWalletFirstRuntimeEffectReconciliationRequiredForDeferredTransition",
  "recordWalletFirstRuntimeReceiptForDeferredTransition",
  "completeWalletFirstTransitionEffectForDeferredTransition",
  "assertWalletFirstSetupDeliveryHandoffForDeferredTransition"
]);
const SUBSCRIPTION_CORE_METHODS = Object.freeze([
  "listTenants",
  "createTenant",
  "renewTenant",
  "listSubscriptionArtifacts",
  "createSubscriptionArtifact"
]);
const CONTROL_ADAPTER_METHODS = Object.freeze([
  "getWalletFirstAccount",
  "resolveExactWalletFirstResourceChain",
  "getWalletFirstTransitionEffect",
  "prepareWalletFirstInitialActivation",
  "prepareWalletFirstScheduledSwitch",
  "completeWalletFirstTransitionEffect",
  "assertWalletFirstSetupDeliveryHandoff"
]);
const RUNTIME_ADAPTER_METHODS = Object.freeze([
  "verifyWalletFirstTransition",
  "applyWalletFirstTransition"
]);
const REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const RUNTIME_ID = /^[A-Za-z0-9_-]{3,128}$/;
const NODE_ID = /^[A-Za-z0-9][A-Za-z0-9_:-]{0,127}$/;
const ISO_UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DIGEST = /^[a-f0-9]{64}$/;
const RUNTIME_MARKER_PREFIX = "wallet_first_resource_effect_v1:";
const RUNTIME_EFFECT_LEASE_MS = 60_000;
const LEASE_TOKEN = /^[a-f0-9]{64}$/;
const CONTROL_ADAPTER_INSTANCES = new WeakSet();
const RUNTIME_ADAPTER_INSTANCES = new WeakSet();

function adapterError(code = "wallet_first_resource_effect_unavailable") {
  const error = new Error("Wallet-first resource effect adapter is unavailable");
  error.code = code;
  return error;
}

function isPlainObject(value) {
  return (
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && !utilTypes.isProxy(value)
    && Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactData(value, fields, code = "wallet_first_resource_effect_invalid") {
  try {
    if (!isPlainObject(value)) throw adapterError(code);
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length || !fields.every((field) => keys.includes(field))) {
      throw adapterError(code);
    }
    const output = {};
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw adapterError(code);
      }
      output[field] = descriptor.value;
    }
    return Object.freeze(output);
  } catch (error) {
    if (error?.code === code) throw error;
    throw adapterError(code);
  }
}

function snapshotDependency(value, methods, code) {
  try {
    if (
      !value
      || (typeof value !== "object" && typeof value !== "function")
      || utilTypes.isProxy(value)
    ) {
      throw adapterError(code);
    }
    const snapshot = {};
    for (const method of methods) {
      const descriptor = Object.getOwnPropertyDescriptor(value, method);
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "function") {
        throw adapterError(code);
      }
      snapshot[method] = (...args) => descriptor.value.call(value, ...args);
    }
    return Object.freeze(snapshot);
  } catch (error) {
    if (error?.code === code) throw error;
    throw adapterError(code);
  }
}

function exactFactoryOptions(options) {
  let values;
  try {
    if (!isPlainObject(options)) {
      throw adapterError("wallet_first_resource_effect_invalid");
    }
    const fields = [...FACTORY_FIELDS, ...OPTIONAL_FACTORY_FIELDS];
    const keys = Reflect.ownKeys(options);
    if (
      keys.length < FACTORY_FIELDS.length
      || keys.length > fields.length
      || !keys.every((key) => typeof key === "string" && fields.includes(key))
      || !FACTORY_FIELDS.every((field) => Object.hasOwn(options, field))
    ) {
      throw adapterError("wallet_first_resource_effect_invalid");
    }
    values = {};
    for (const field of fields) {
      if (!Object.hasOwn(options, field)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(options, field);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw adapterError("wallet_first_resource_effect_invalid");
      }
      values[field] = descriptor.value;
    }
  } catch (error) {
    if (error?.code === "wallet_first_resource_effect_invalid") throw error;
    throw adapterError("wallet_first_resource_effect_invalid");
  }
  if (typeof values.nowFn !== "function") {
    throw adapterError("wallet_first_resource_effect_invalid");
  }
  if (typeof values.nodeId !== "string" || !NODE_ID.test(values.nodeId)) {
    throw adapterError("wallet_first_resource_effect_invalid");
  }
  let setupDeliveryRuntimeEscrow = null;
  if (Object.hasOwn(values, "setupDeliveryRuntimeEscrow")) {
    try {
      setupDeliveryRuntimeEscrow = snapshotWalletFirstSetupDeliveryRuntimeEscrow(
        values.setupDeliveryRuntimeEscrow
      );
    } catch {
      throw adapterError("wallet_first_resource_effect_invalid");
    }
  }
  return Object.freeze({ ...values, setupDeliveryRuntimeEscrow });
}

function reference(value, code = "wallet_first_resource_effect_invalid") {
  if (typeof value !== "string" || !REFERENCE.test(value)) {
    throw adapterError(code);
  }
  return value;
}

function runtimeId(value, code = "wallet_first_resource_effect_invalid") {
  if (typeof value !== "string" || !RUNTIME_ID.test(value)) {
    throw adapterError(code);
  }
  return value;
}

function timestamp(value, code = "wallet_first_resource_effect_invalid") {
  if (
    typeof value !== "string"
    || !ISO_UTC_MILLIS.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw adapterError(code);
  }
  return value;
}

function nullableTimestamp(value, code = "wallet_first_resource_effect_invalid") {
  return value === null ? null : timestamp(value, code);
}

function currentNow(nowFn) {
  let now;
  try {
    now = nowFn();
  } catch {
    throw adapterError();
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw adapterError();
  }
  return now.toISOString();
}

function runtimeBindingRef(prefix, runtimeValue) {
  return `${prefix}ref_${createHash("sha256")
    .update(runtimeValue)
    .digest("hex")
    .slice(0, 16)}`;
}

export function walletFirstResourceEffectRuntimeMarker(transitionRef) {
  const normalized = reference(transitionRef);
  // Notes are operator-visible and reject long opaque-looking material. Keep
  // the marker deterministic for recovery while never persisting the raw
  // deferred transition reference in Core.
  const markerDigest = createHash("sha256")
    .update(
      `GCCWEBOS:WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_MARKER:v1\0${normalized}`,
      "utf8"
    )
    .digest("hex")
    .slice(0, 24);
  return `${RUNTIME_MARKER_PREFIX}wfxm_${markerDigest}`;
}

function normalizeOffer(value) {
  const input = exactData(value, [
    "offerVersionRef", "durationDays", "monthlyTrafficGb"
  ]);
  if (
    !Number.isSafeInteger(input.durationDays)
    || input.durationDays < 1
    || !Number.isSafeInteger(input.monthlyTrafficGb)
    || input.monthlyTrafficGb < 1
  ) {
    throw adapterError("wallet_first_resource_effect_invalid");
  }
  return Object.freeze({
    offerVersionRef: reference(input.offerVersionRef),
    durationDays: input.durationDays,
    monthlyTrafficGb: input.monthlyTrafficGb
  });
}

function normalizeSuccessor(value) {
  const input = exactData(value, [
    "entitlementId", "requestId", "issuedLinkId", "validUntil"
  ]);
  return Object.freeze({
    entitlementId: reference(input.entitlementId),
    requestId: reference(input.requestId),
    issuedLinkId: reference(input.issuedLinkId),
    validUntil: timestamp(input.validUntil)
  });
}

function normalizePreparationInput(value, { scheduled }) {
  const fields = scheduled
    ? ["transitionRef", "accountId", "offer", "scheduledFor", "activationAt", "expectedChain"]
    : ["transitionRef", "accountId", "offer", "scheduledFor", "activationAt"];
  const input = exactData(value, fields);
  const normalized = {
    transitionRef: reference(input.transitionRef),
    accountId: reference(input.accountId),
    offer: normalizeOffer(input.offer),
    scheduledFor: timestamp(input.scheduledFor),
    activationAt: timestamp(input.activationAt)
  };
  if (scheduled) {
    normalized.expectedChain = normalizeSuccessor(input.expectedChain);
    if (normalized.scheduledFor !== normalized.expectedChain.validUntil) {
      throw adapterError("wallet_first_resource_effect_invalid");
    }
  } else if (normalized.scheduledFor > normalized.activationAt) {
    throw adapterError("wallet_first_resource_effect_invalid");
  }
  return Object.freeze(normalized);
}

function normalizeCompletionInput(value) {
  let hasSetupDeliveryHandoffRef;
  try {
    hasSetupDeliveryHandoffRef = Object.hasOwn(value, "setupDeliveryHandoffRef");
  } catch {
    throw adapterError("wallet_first_resource_effect_invalid");
  }
  const input = exactData(value, hasSetupDeliveryHandoffRef ? [
    "transitionRef", "effectRef", "successor", "runtimeReceiptRef", "setupDeliveryHandoffRef"
  ] : [
    "transitionRef", "effectRef", "successor", "runtimeReceiptRef"
  ]);
  return Object.freeze({
    transitionRef: reference(input.transitionRef),
    effectRef: reference(input.effectRef),
    successor: normalizeSuccessor(input.successor),
    runtimeReceiptRef: reference(input.runtimeReceiptRef),
    setupDeliveryHandoffRef: hasSetupDeliveryHandoffRef
      ? reference(input.setupDeliveryHandoffRef)
      : null
  });
}

function normalizeRuntimeRequest(value, flowKind, configuredNodeId) {
  const fields = flowKind === "initial_activation"
    ? ["kind", "accountDigest", "nodeId", "scheduledFor", "activationAt", "validUntil"]
    : [
      "kind", "accountDigest", "nodeId", "scheduledFor", "activationAt", "validUntil",
      "tenantRef", "artifactRef", "initialTransitionRef"
    ];
  const input = exactData(value, fields);
  if (
    input.kind !== "wallet_first_resource_effect_v1"
    || typeof input.accountDigest !== "string"
    || !DIGEST.test(input.accountDigest)
    || input.nodeId !== configuredNodeId
  ) {
    throw adapterError("wallet_first_resource_effect_invalid");
  }
  const normalized = {
    accountDigest: input.accountDigest,
    nodeId: configuredNodeId,
    scheduledFor: timestamp(input.scheduledFor),
    activationAt: timestamp(input.activationAt),
    validUntil: timestamp(input.validUntil)
  };
  if (normalized.validUntil <= normalized.activationAt) {
    throw adapterError("wallet_first_resource_effect_invalid");
  }
  if (flowKind === "initial_activation") {
    if (normalized.scheduledFor > normalized.activationAt) {
      throw adapterError("wallet_first_resource_effect_invalid");
    }
  } else {
    normalized.tenantRef = reference(input.tenantRef);
    normalized.artifactRef = reference(input.artifactRef);
    normalized.initialTransitionRef = reference(input.initialTransitionRef);
    if (normalized.scheduledFor >= normalized.validUntil) {
      throw adapterError("wallet_first_resource_effect_invalid");
    }
  }
  return Object.freeze(normalized);
}

function normalizeRuntimeInput(value, configuredNodeId) {
  const input = exactData(value, [
    "transitionRef", "effectRef", "flowKind", "successor", "runtimeRequest"
  ]);
  if (!["initial_activation", "scheduled_switch"].includes(input.flowKind)) {
    throw adapterError("wallet_first_resource_effect_invalid");
  }
  const transitionRef = reference(input.transitionRef);
  const successor = normalizeSuccessor(input.successor);
  const runtimeRequest = normalizeRuntimeRequest(
    input.runtimeRequest,
    input.flowKind,
    configuredNodeId
  );
  if (runtimeRequest.validUntil !== successor.validUntil) {
    throw adapterError("wallet_first_resource_effect_invalid");
  }
  return Object.freeze({
    transitionRef,
    effectRef: reference(input.effectRef),
    flowKind: input.flowKind,
    successor,
    runtimeRequest
  });
}

function normalizeRuntimeVerificationInput(value) {
  const input = exactData(value, ["transitionRef", "effectRef", "successor"]);
  return Object.freeze({
    transitionRef: reference(input.transitionRef),
    effectRef: reference(input.effectRef),
    successor: normalizeSuccessor(input.successor)
  });
}

function normalizeStoredRuntimeReceipt(value) {
  const input = exactData(value, [
    "transitionRef", "effectRef", "flowKind", "successor", "tenantId", "artifactId",
    "tenantRef", "artifactRef", "nodeId", "initialTransitionRef", "runtimeReceiptRef"
  ], "wallet_first_resource_effect_unavailable");
  if (!["initial_activation", "scheduled_switch"].includes(input.flowKind)) {
    throw adapterError();
  }
  const tenantId = runtimeId(input.tenantId, "wallet_first_resource_effect_unavailable");
  const artifactId = runtimeId(input.artifactId, "wallet_first_resource_effect_unavailable");
  const tenantRef = reference(input.tenantRef, "wallet_first_resource_effect_unavailable");
  const artifactRef = reference(input.artifactRef, "wallet_first_resource_effect_unavailable");
  if (
    tenantRef !== runtimeBindingRef("tenant", tenantId)
    || artifactRef !== runtimeBindingRef("artifact", artifactId)
  ) {
    throw adapterError();
  }
  return Object.freeze({
    transitionRef: reference(input.transitionRef, "wallet_first_resource_effect_unavailable"),
    effectRef: reference(input.effectRef, "wallet_first_resource_effect_unavailable"),
    flowKind: input.flowKind,
    successor: normalizeSuccessor(input.successor),
    tenantId,
    artifactId,
    tenantRef,
    artifactRef,
    nodeId: input.nodeId,
    initialTransitionRef: reference(
      input.initialTransitionRef,
      "wallet_first_resource_effect_unavailable"
    ),
    runtimeReceiptRef: reference(input.runtimeReceiptRef, "wallet_first_resource_effect_unavailable")
  });
}

function normalizeCurrentRuntimeVerification(value, receipt) {
  const input = exactData(value, [
    "transitionRef", "effectRef", "tenantRef", "artifactRef", "nodeId",
    "initialTransitionRef", "validUntil"
  ], "wallet_first_resource_effect_unavailable");
  const normalized = Object.freeze({
    transitionRef: reference(input.transitionRef, "wallet_first_resource_effect_unavailable"),
    effectRef: reference(input.effectRef, "wallet_first_resource_effect_unavailable"),
    tenantRef: reference(input.tenantRef, "wallet_first_resource_effect_unavailable"),
    artifactRef: reference(input.artifactRef, "wallet_first_resource_effect_unavailable"),
    nodeId: reference(input.nodeId, "wallet_first_resource_effect_unavailable"),
    initialTransitionRef: reference(
      input.initialTransitionRef,
      "wallet_first_resource_effect_unavailable"
    ),
    validUntil: timestamp(input.validUntil, "wallet_first_resource_effect_unavailable")
  });
  if (
    normalized.transitionRef !== receipt.transitionRef
    || normalized.effectRef !== receipt.effectRef
    || normalized.tenantRef !== receipt.tenantRef
    || normalized.artifactRef !== receipt.artifactRef
    || normalized.nodeId !== receipt.nodeId
    || normalized.initialTransitionRef !== receipt.initialTransitionRef
    || normalized.validUntil < receipt.successor.validUntil
  ) {
    throw adapterError("wallet_first_resource_effect_reconciliation_required");
  }
  return normalized;
}

function normalizeTenant(value) {
  const input = exactData(value, [
    "id", "displayName", "status", "expiresAt", "note", "nodeName", "tokenPrefix",
    "lastUsedAt", "credentialMode"
  ], "wallet_first_resource_effect_unavailable");
  if (
    typeof input.displayName !== "string"
    || !["active", "expiring", "expired", "disabled"].includes(input.status)
    || typeof input.note !== "string"
    || typeof input.nodeName !== "string"
    || !NODE_ID.test(input.nodeName)
    || typeof input.tokenPrefix !== "string"
    || input.credentialMode !== "shared-node"
  ) {
    throw adapterError();
  }
  return Object.freeze({
    id: runtimeId(input.id, "wallet_first_resource_effect_unavailable"),
    status: input.status,
    expiresAt: timestamp(input.expiresAt, "wallet_first_resource_effect_unavailable"),
    note: input.note,
    nodeName: input.nodeName,
    lastUsedAt: nullableTimestamp(input.lastUsedAt, "wallet_first_resource_effect_unavailable")
  });
}

function normalizeArtifact(value) {
  const input = exactData(value, [
    "id", "tenantId", "artifactPrefix", "status", "firstSeenAt", "lastSeenAt",
    "rotatedAt", "revokedAt", "refreshCount", "createdAt", "updatedAt"
  ], "wallet_first_resource_effect_unavailable");
  if (
    typeof input.artifactPrefix !== "string"
    || !["active", "suspicious", "revoked", "rotated"].includes(input.status)
    || !Number.isSafeInteger(input.refreshCount)
    || input.refreshCount < 0
  ) {
    throw adapterError();
  }
  return Object.freeze({
    id: runtimeId(input.id, "wallet_first_resource_effect_unavailable"),
    tenantId: runtimeId(input.tenantId, "wallet_first_resource_effect_unavailable"),
    status: input.status,
    firstSeenAt: nullableTimestamp(input.firstSeenAt, "wallet_first_resource_effect_unavailable"),
    lastSeenAt: nullableTimestamp(input.lastSeenAt, "wallet_first_resource_effect_unavailable"),
    rotatedAt: nullableTimestamp(input.rotatedAt, "wallet_first_resource_effect_unavailable"),
    revokedAt: nullableTimestamp(input.revokedAt, "wallet_first_resource_effect_unavailable"),
    createdAt: timestamp(input.createdAt, "wallet_first_resource_effect_unavailable"),
    updatedAt: timestamp(input.updatedAt, "wallet_first_resource_effect_unavailable")
  });
}

function normalizeCreatedTenant(value) {
  const input = exactData(value, ["tenant", "subscriptionUrl"], "wallet_first_resource_effect_unavailable");
  if (typeof input.subscriptionUrl !== "string") throw adapterError();
  return normalizeTenant(input.tenant);
}

function normalizeCreatedArtifact(value) {
  const input = exactData(value, ["artifact", "subscriptionUrl"], "wallet_first_resource_effect_unavailable");
  if (typeof input.subscriptionUrl !== "string") throw adapterError();
  return Object.freeze({
    artifact: normalizeArtifact(input.artifact),
    subscriptionUrl: input.subscriptionUrl
  });
}

function normalizeSetupDeliveryEscrowSummary(value) {
  const code = "wallet_first_resource_effect_reconciliation_required";
  const summary = exactData(value, [
    "version", "state", "handoffRef", "bindingDigest", "resourceDigest"
  ], code);
  if (
    summary.version !== "wallet_first_setup_delivery_escrow_v1"
    || !["available", "acknowledged"].includes(summary.state)
    || !DIGEST.test(summary.bindingDigest)
    || !DIGEST.test(summary.resourceDigest)
  ) {
    throw adapterError(code);
  }
  return Object.freeze({
    handoffRef: reference(summary.handoffRef, code),
    state: summary.state
  });
}

function initialSetupDeliveryBinding(input, tenant, artifact) {
  return Object.freeze({
    transitionRef: input.transitionRef,
    effectRef: input.effectRef,
    tenantId: tenant.id,
    artifactId: artifact.id
  });
}

function verifyInitialSetupDeliveryEscrow(escrow, receipt) {
  if (!escrow || receipt.flowKind !== "initial_activation") return null;
  try {
    return normalizeSetupDeliveryEscrowSummary(
      escrow.verifyInitialSetupDelivery(Object.freeze({
        transitionRef: receipt.transitionRef,
        effectRef: receipt.effectRef,
        tenantId: receipt.tenantId,
        artifactId: receipt.artifactId
      }))
    );
  } catch {
    throw adapterError("wallet_first_resource_effect_reconciliation_required");
  }
}

async function assertInitialSetupDeliveryHandoff(control, receipt, summary) {
  if (summary === null) return;
  try {
    const asserted = await control.assertWalletFirstSetupDeliveryHandoff(Object.freeze({
      transitionRef: receipt.transitionRef,
      effectRef: receipt.effectRef,
      handoffRef: summary.handoffRef
    }));
    exactData(asserted, [], "wallet_first_resource_effect_reconciliation_required");
  } catch (error) {
    if (error?.code === "wallet_first_resource_effect_reconciliation_required") {
      throw error;
    }
    throw adapterError("wallet_first_resource_effect_reconciliation_required");
  }
}

function captureInitialSetupDeliveryEscrow(escrow, input, tenant, artifact, subscriptionUrl) {
  if (!escrow) return null;
  try {
    return normalizeSetupDeliveryEscrowSummary(
      escrow.captureInitialSetupDelivery(Object.freeze({
        ...initialSetupDeliveryBinding(input, tenant, artifact),
        subscriptionUrl
      }))
    );
  } catch {
    throw adapterError("wallet_first_resource_effect_reconciliation_required");
  }
}

function runtimeReceiptOutput(receipt, setupDeliverySummary = null) {
  return Object.freeze({
    transitionRef: receipt.transitionRef,
    runtimeReceiptRef: receipt.runtimeReceiptRef,
    ...(setupDeliverySummary ? {
      setupDeliveryHandoffRef: setupDeliverySummary.handoffRef
    } : {})
  });
}

function normalizeTenantList(value) {
  if (
    !Array.isArray(value)
    || utilTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || Reflect.ownKeys(value).length !== value.length + 1
  ) {
    throw adapterError();
  }
  const output = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw adapterError();
    output.push(normalizeTenant(descriptor.value));
  }
  return Object.freeze(output);
}

function normalizeArtifactList(value) {
  if (
    !Array.isArray(value)
    || utilTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || Reflect.ownKeys(value).length !== value.length + 1
  ) {
    throw adapterError();
  }
  const output = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw adapterError();
    output.push(normalizeArtifact(descriptor.value));
  }
  return Object.freeze(output);
}

function assertRuntimeReceiptMatchesInput(receipt, input, configuredNodeId) {
  if (
    receipt.transitionRef !== input.transitionRef
    || receipt.effectRef !== input.effectRef
    || receipt.flowKind !== input.flowKind
    || receipt.successor.entitlementId !== input.successor.entitlementId
    || receipt.successor.requestId !== input.successor.requestId
    || receipt.successor.issuedLinkId !== input.successor.issuedLinkId
    || receipt.successor.validUntil !== input.successor.validUntil
    || receipt.nodeId !== configuredNodeId
    || receipt.initialTransitionRef !== (
      input.flowKind === "initial_activation"
        ? input.transitionRef
        : input.runtimeRequest.initialTransitionRef
    )
  ) {
    throw adapterError();
  }
}

function assertTenantForInitial(tenant, input) {
  if (
    tenant.note !== walletFirstResourceEffectRuntimeMarker(input.transitionRef)
    || tenant.nodeName !== input.runtimeRequest.nodeId
    || tenant.expiresAt !== input.successor.validUntil
    || tenant.status === "disabled"
  ) {
    throw adapterError("wallet_first_resource_effect_reconciliation_required");
  }
}

function assertTenantForScheduled(tenant, input) {
  if (
    tenant.note !== walletFirstResourceEffectRuntimeMarker(input.runtimeRequest.initialTransitionRef)
    || tenant.nodeName !== input.runtimeRequest.nodeId
    || tenant.status === "disabled"
  ) {
    throw adapterError("wallet_first_resource_effect_reconciliation_required");
  }
}

function assertArtifactForTenant(artifact, tenant) {
  if (
    artifact.tenantId !== tenant.id
    || artifact.status !== "active"
  ) {
    throw adapterError("wallet_first_resource_effect_reconciliation_required");
  }
}

async function assertRecordedRuntimeReceiptHealthy(
  runtimeCore,
  receipt,
  verification,
  currentRuntime = null
) {
  if (
    receipt.transitionRef !== verification.transitionRef
    || receipt.effectRef !== verification.effectRef
    || receipt.successor.entitlementId !== verification.successor.entitlementId
    || receipt.successor.requestId !== verification.successor.requestId
    || receipt.successor.issuedLinkId !== verification.successor.issuedLinkId
    || receipt.successor.validUntil !== verification.successor.validUntil
  ) {
    throw adapterError("wallet_first_resource_effect_reconciliation_required");
  }
  const tenants = normalizeTenantList(await runtimeCore.listTenants());
  const tenantMatches = tenants.filter((tenant) => (
    tenant.id === receipt.tenantId
    && runtimeBindingRef("tenant", tenant.id) === receipt.tenantRef
  ));
  if (tenantMatches.length !== 1) {
    throw adapterError("wallet_first_resource_effect_reconciliation_required");
  }
  const tenant = tenantMatches[0];
  const expectedRuntime = currentRuntime || Object.freeze({
    tenantRef: receipt.tenantRef,
    artifactRef: receipt.artifactRef,
    nodeId: receipt.nodeId,
    initialTransitionRef: receipt.initialTransitionRef,
    validUntil: receipt.successor.validUntil
  });
  if (
    tenant.note !== walletFirstResourceEffectRuntimeMarker(expectedRuntime.initialTransitionRef)
    || tenant.nodeName !== expectedRuntime.nodeId
    || tenant.expiresAt !== expectedRuntime.validUntil
    || tenant.status === "disabled"
  ) {
    throw adapterError("wallet_first_resource_effect_reconciliation_required");
  }
  const artifacts = normalizeArtifactList(await runtimeCore.listSubscriptionArtifacts(tenant.id));
  const artifactMatches = artifacts.filter((artifact) => (
    artifact.id === receipt.artifactId
    && runtimeBindingRef("artifact", artifact.id) === expectedRuntime.artifactRef
  ));
  if (artifacts.length !== 1 || artifactMatches.length !== 1) {
    throw adapterError("wallet_first_resource_effect_reconciliation_required");
  }
  assertArtifactForTenant(artifactMatches[0], tenant);
}

async function inspectClaimedRuntime(runtimeCore, input) {
  let tenant;
  let state = "target";
  if (input.flowKind === "initial_activation") {
    const tenants = normalizeTenantList(await runtimeCore.listTenants());
    const matching = tenants.filter(
      (candidate) => candidate.note === walletFirstResourceEffectRuntimeMarker(input.transitionRef)
    );
    if (matching.length === 0) {
      return Object.freeze({ tenant: null, artifact: null, state: "missing" });
    }
    if (matching.length !== 1) {
      throw adapterError("wallet_first_resource_effect_reconciliation_required");
    }
    tenant = matching[0];
    assertTenantForInitial(tenant, input);
  } else {
    const tenants = normalizeTenantList(await runtimeCore.listTenants());
    const matching = tenants.filter(
      (candidate) => runtimeBindingRef("tenant", candidate.id) === input.runtimeRequest.tenantRef
    );
    if (matching.length !== 1) {
      throw adapterError("wallet_first_resource_effect_reconciliation_required");
    }
    tenant = matching[0];
    assertTenantForScheduled(tenant, input);
    if (tenant.expiresAt === input.successor.validUntil) {
      state = "target";
    } else if (tenant.expiresAt === input.runtimeRequest.scheduledFor) {
      state = "old";
    } else {
      throw adapterError("wallet_first_resource_effect_reconciliation_required");
    }
  }
  const artifacts = normalizeArtifactList(await runtimeCore.listSubscriptionArtifacts(tenant.id));
  if (artifacts.length !== 1) {
    throw adapterError("wallet_first_resource_effect_reconciliation_required");
  }
  const artifact = artifacts[0];
  assertArtifactForTenant(artifact, tenant);
  if (
    input.flowKind === "scheduled_switch"
    && runtimeBindingRef("artifact", artifact.id) !== input.runtimeRequest.artifactRef
  ) {
    throw adapterError("wallet_first_resource_effect_reconciliation_required");
  }
  return Object.freeze({ tenant, artifact, state });
}

function normalizeClaimLease(value) {
  const claim = exactData(
    value,
    ["status", "leaseGeneration", "leaseToken"],
    "wallet_first_resource_effect_unavailable"
  );
  if (
    claim.status !== "claimed"
    || !Number.isSafeInteger(claim.leaseGeneration)
    || claim.leaseGeneration < 1
    || typeof claim.leaseToken !== "string"
    || !LEASE_TOKEN.test(claim.leaseToken)
  ) {
    throw adapterError("wallet_first_resource_effect_unavailable");
  }
  return Object.freeze({
    leaseGeneration: claim.leaseGeneration,
    leaseToken: claim.leaseToken
  });
}

function normalizeClaimStatus(value) {
  const claim = exactData(value, ["status"], "wallet_first_resource_effect_unavailable");
  if (!["blocked", "completed", "reconciliation_required"].includes(claim.status)) {
    throw adapterError("wallet_first_resource_effect_unavailable");
  }
  return claim.status;
}

async function recordRuntimeReceipt(
  control,
  input,
  lease,
  tenant,
  artifact,
  nodeId,
  nowFn,
  setupDeliverySummary = null
) {
  let recorded;
  try {
    recorded = await control.recordWalletFirstRuntimeReceiptForDeferredTransition({
      transitionRef: input.transitionRef,
      flowKind: input.flowKind,
      successor: input.successor,
      tenantId: tenant.id,
      artifactId: artifact.id,
      nodeId,
      now: currentNow(nowFn),
      leaseGeneration: lease.leaseGeneration,
      leaseToken: lease.leaseToken
    });
  } catch {
    throw adapterError("wallet_first_resource_effect_reconciliation_required");
  }
  const runtimeReceipt = exactData(
    recorded,
    ["transitionRef", "runtimeReceiptRef"],
    "wallet_first_resource_effect_unavailable"
  );
  if (
    reference(runtimeReceipt.transitionRef, "wallet_first_resource_effect_unavailable") !== input.transitionRef
    || !REFERENCE.test(runtimeReceipt.runtimeReceiptRef)
  ) {
    throw adapterError();
  }
  return Object.freeze({
    transitionRef: input.transitionRef,
    runtimeReceiptRef: runtimeReceipt.runtimeReceiptRef,
    ...(setupDeliverySummary ? {
      setupDeliveryHandoffRef: setupDeliverySummary.handoffRef
    } : {})
  });
}

async function markRuntimeReconciliation(control, input, lease, nodeId, nowFn, safeCode) {
  try {
    await control.markWalletFirstRuntimeEffectReconciliationRequiredForDeferredTransition({
      transitionRef: input.transitionRef,
      flowKind: input.flowKind,
      successor: input.successor,
      nodeId,
      now: currentNow(nowFn),
      leaseGeneration: lease.leaseGeneration,
      leaseToken: lease.leaseToken,
      safeCode
    });
  } catch {
    throw adapterError("wallet_first_resource_effect_unavailable");
  }
  throw adapterError("wallet_first_resource_effect_reconciliation_required");
}

function snapshotBrandedAdapter(adapter, {
  instances,
  contract,
  methods,
  code
}) {
  try {
    if (
      !adapter
      || (typeof adapter !== "object" && typeof adapter !== "function")
      || utilTypes.isProxy(adapter)
      || !instances.has(adapter)
    ) {
      throw adapterError(code);
    }
    const expectedFields = ["contract", "idempotencyContract", ...methods];
    const keys = Reflect.ownKeys(adapter);
    if (keys.length !== expectedFields.length || !expectedFields.every((field) => keys.includes(field))) {
      throw adapterError(code);
    }
    const contractDescriptor = Object.getOwnPropertyDescriptor(adapter, "contract");
    const idempotencyDescriptor = Object.getOwnPropertyDescriptor(adapter, "idempotencyContract");
    if (
      !contractDescriptor
      || !contractDescriptor.enumerable
      || !("value" in contractDescriptor)
      || contractDescriptor.value !== contract
      || !idempotencyDescriptor
      || !idempotencyDescriptor.enumerable
      || !("value" in idempotencyDescriptor)
      || idempotencyDescriptor.value !== WALLET_FIRST_RESOURCE_EFFECT_ADAPTER_IDEMPOTENCY_CONTRACT
    ) {
      throw adapterError(code);
    }
    const snapshot = {
      idempotencyContract: WALLET_FIRST_RESOURCE_EFFECT_ADAPTER_IDEMPOTENCY_CONTRACT
    };
    for (const method of methods) {
      const descriptor = Object.getOwnPropertyDescriptor(adapter, method);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || typeof descriptor.value !== "function") {
        throw adapterError(code);
      }
      snapshot[method] = (...args) => descriptor.value.call(adapter, ...args);
    }
    return Object.freeze(snapshot);
  } catch (error) {
    if (error?.code === code) throw error;
    throw adapterError(code);
  }
}

/**
 * The effect handler must snapshot this rather than accept a look-alike
 * object. The module-local WeakSet makes a contract string plus matching
 * method names insufficient to inject a replacement control adapter.
 */
export function snapshotWalletFirstResourceEffectControlAdapter(adapter) {
  return snapshotBrandedAdapter(adapter, {
    instances: CONTROL_ADAPTER_INSTANCES,
    contract: WALLET_FIRST_RESOURCE_EFFECT_CONTROL_ADAPTER_CONTRACT,
    methods: CONTROL_ADAPTER_METHODS,
    code: "wallet_first_resource_effect_invalid"
  });
}

/**
 * The runtime half is separately branded so a valid control adapter cannot
 * be repurposed as a runtime capability (or vice versa).
 */
export function snapshotWalletFirstResourceEffectRuntimeAdapter(adapter) {
  return snapshotBrandedAdapter(adapter, {
    instances: RUNTIME_ADAPTER_INSTANCES,
    contract: WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_ADAPTER_CONTRACT,
    methods: RUNTIME_ADAPTER_METHODS,
    code: "wallet_first_resource_effect_invalid"
  });
}

/**
 * Builds the only concrete control/runtime bridge for wallet-first deferred
 * transitions. It reads no environment and is not a feature gate: callers
 * must provide an already-authorized runtime Core and a specific node. The
 * wrapper never exposes ordinary Commerce fulfillment or Authority methods.
 */
export function createWalletFirstResourceEffectAdapters(options = {}) {
  const values = exactFactoryOptions(options);
  const control = snapshotDependency(
    values.controlStore,
    CONTROL_STORE_METHODS,
    "wallet_first_resource_effect_invalid"
  );
  const runtimeCore = snapshotDependency(
    values.subscriptionCore,
    SUBSCRIPTION_CORE_METHODS,
    "wallet_first_resource_effect_invalid"
  );

  const controlAdapter = Object.freeze({
    contract: WALLET_FIRST_RESOURCE_EFFECT_CONTROL_ADAPTER_CONTRACT,
    idempotencyContract: WALLET_FIRST_RESOURCE_EFFECT_ADAPTER_IDEMPOTENCY_CONTRACT,
    getWalletFirstAccount(input) {
      const request = exactData(input, ["accountId"]);
      return control.getWalletFirstAccountForDeferredTransition({
        accountId: reference(request.accountId)
      });
    },
    resolveExactWalletFirstResourceChain(input) {
      const request = exactData(input, ["accountId"]);
      return control.resolveExactWalletFirstResourceChainForDeferredTransition({
        accountId: reference(request.accountId)
      });
    },
    getWalletFirstTransitionEffect(input) {
      const request = exactData(input, ["transitionRef"]);
      return control.getWalletFirstTransitionEffectForDeferredTransition({
        transitionRef: reference(request.transitionRef)
      });
    },
    prepareWalletFirstInitialActivation(input) {
      const request = normalizePreparationInput(input, { scheduled: false });
      return control.prepareWalletFirstInitialActivationForDeferredTransition({
        ...request,
        nodeId: values.nodeId,
        now: currentNow(values.nowFn)
      });
    },
    prepareWalletFirstScheduledSwitch(input) {
      const request = normalizePreparationInput(input, { scheduled: true });
      return control.prepareWalletFirstScheduledSwitchForDeferredTransition({
        ...request,
        nodeId: values.nodeId,
        now: currentNow(values.nowFn)
      });
    },
    completeWalletFirstTransitionEffect(input) {
      const request = normalizeCompletionInput(input);
      return control.completeWalletFirstTransitionEffectForDeferredTransition({
        transitionRef: request.transitionRef,
        effectRef: request.effectRef,
        successor: request.successor,
        runtimeReceiptRef: request.runtimeReceiptRef,
        ...(request.setupDeliveryHandoffRef === null ? {} : {
          setupDeliveryHandoffRef: request.setupDeliveryHandoffRef
        }),
        now: currentNow(values.nowFn)
      });
    },
    assertWalletFirstSetupDeliveryHandoff(input) {
      const request = exactData(input, ["transitionRef", "effectRef", "handoffRef"]);
      return control.assertWalletFirstSetupDeliveryHandoffForDeferredTransition({
        transitionRef: reference(request.transitionRef),
        effectRef: reference(request.effectRef),
        handoffRef: reference(request.handoffRef)
      });
    }
  });

  const runtimeAdapter = Object.freeze({
    contract: WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_ADAPTER_CONTRACT,
    idempotencyContract: WALLET_FIRST_RESOURCE_EFFECT_ADAPTER_IDEMPOTENCY_CONTRACT,
    async verifyWalletFirstTransition(value) {
      const verification = normalizeRuntimeVerificationInput(value);
      let stored;
      try {
        stored = await control.getWalletFirstRuntimeReceiptForDeferredTransition({
          transitionRef: verification.transitionRef
        });
      } catch {
        throw adapterError();
      }
      if (stored === null) {
        throw adapterError("wallet_first_resource_effect_reconciliation_required");
      }
      try {
        const receipt = normalizeStoredRuntimeReceipt(stored);
        const currentRuntime = normalizeCurrentRuntimeVerification(
          await control.verifyWalletFirstRuntimeTransitionForDeferredTransition({
            transitionRef: verification.transitionRef,
            effectRef: verification.effectRef,
            successor: verification.successor
          }),
          receipt
        );
        await assertRecordedRuntimeReceiptHealthy(
          runtimeCore,
          receipt,
          verification,
          currentRuntime
        );
        const setupDeliverySummary = verifyInitialSetupDeliveryEscrow(
          values.setupDeliveryRuntimeEscrow,
          receipt
        );
        await assertInitialSetupDeliveryHandoff(
          controlAdapter,
          receipt,
          setupDeliverySummary
        );
        return Object.freeze(setupDeliverySummary === null
          ? {}
          : { setupDeliveryHandoffRef: setupDeliverySummary.handoffRef });
      } catch (error) {
        if (error?.code === "wallet_first_resource_effect_reconciliation_required") {
          throw error;
        }
        throw adapterError();
      }
    },
    async applyWalletFirstTransition(value) {
      const input = normalizeRuntimeInput(value, values.nodeId);
      let stored;
      try {
        stored = await control.getWalletFirstRuntimeReceiptForDeferredTransition({
          transitionRef: input.transitionRef
        });
      } catch {
        throw adapterError();
      }
      if (stored !== null) {
        const receipt = normalizeStoredRuntimeReceipt(stored);
        assertRuntimeReceiptMatchesInput(receipt, input, values.nodeId);
        await assertRecordedRuntimeReceiptHealthy(runtimeCore, receipt, {
          transitionRef: input.transitionRef,
          effectRef: receipt.effectRef,
          successor: input.successor
        });
        return runtimeReceiptOutput(
          receipt,
          verifyInitialSetupDeliveryEscrow(values.setupDeliveryRuntimeEscrow, receipt)
        );
      }

      let claim;
      try {
        claim = await control.claimWalletFirstRuntimeEffectForDeferredTransition({
          transitionRef: input.transitionRef,
          flowKind: input.flowKind,
          successor: input.successor,
          nodeId: values.nodeId,
          now: currentNow(values.nowFn),
          leaseMs: RUNTIME_EFFECT_LEASE_MS
        });
      } catch {
        throw adapterError();
      }
      let lease;
      try {
        lease = normalizeClaimLease(claim);
      } catch (error) {
        const status = normalizeClaimStatus(claim);
        if (status === "blocked") {
          // The inner runtime lease outlives (or can outlive) the deferred
          // coordinator lease.  Never probe or mutate under somebody else's
          // runtime lease: the coordinator preserves its outer transition and
          // retries only after this lease is claimable.
          throw adapterError("wallet_first_resource_effect_retryable");
        }
        if (status === "completed") {
          let completed;
          try {
            completed = await control.getWalletFirstRuntimeReceiptForDeferredTransition({
              transitionRef: input.transitionRef
            });
          } catch {
            throw adapterError();
          }
          if (completed === null) throw adapterError();
          const receipt = normalizeStoredRuntimeReceipt(completed);
          assertRuntimeReceiptMatchesInput(receipt, input, values.nodeId);
          await assertRecordedRuntimeReceiptHealthy(runtimeCore, receipt, {
            transitionRef: input.transitionRef,
            effectRef: receipt.effectRef,
            successor: input.successor
          });
          return runtimeReceiptOutput(
            receipt,
            verifyInitialSetupDeliveryEscrow(values.setupDeliveryRuntimeEscrow, receipt)
          );
        }
        throw adapterError("wallet_first_resource_effect_reconciliation_required");
      }

      let observed;
      try {
        observed = await inspectClaimedRuntime(runtimeCore, input);
      } catch (error) {
        if (error?.code === "wallet_first_resource_effect_reconciliation_required") {
          return markRuntimeReconciliation(
            control,
            input,
            lease,
            values.nodeId,
            values.nowFn,
            "runtime_claim_probe_drift"
          );
        }
        throw adapterError();
      }

      let tenant = observed.tenant;
      let artifact = observed.artifact;
      let setupDeliverySummary = null;
      try {
        if (input.flowKind === "initial_activation") {
          if (observed.state === "target") {
            return recordRuntimeReceipt(
              control,
              input,
              lease,
              tenant,
              artifact,
              values.nodeId,
              values.nowFn,
              verifyInitialSetupDeliveryEscrow(values.setupDeliveryRuntimeEscrow, Object.freeze({
                transitionRef: input.transitionRef,
                effectRef: input.effectRef,
                flowKind: input.flowKind,
                tenantId: tenant.id,
                artifactId: artifact.id
              }))
            );
          }
          if (lease.leaseGeneration > 1) {
            // A stale worker may resume after its lease was taken over.  With
            // Core's marker non-unique, a takeover that sees no exact marked
            // tenant must never create another one; manual reconciliation is
            // the only safe outcome without a Core create-or-get fence.
            return markRuntimeReconciliation(
              control,
              input,
              lease,
              values.nodeId,
              values.nowFn,
              "runtime_initial_takeover_unresolved"
            );
          }
          const marker = walletFirstResourceEffectRuntimeMarker(input.transitionRef);
          const tenants = normalizeTenantList(await runtimeCore.listTenants());
          const matching = tenants.filter((candidate) => candidate.note === marker);
          if (matching.length !== 0) {
            throw adapterError("wallet_first_resource_effect_reconciliation_required");
          }
          tenant = normalizeCreatedTenant(await runtimeCore.createTenant({
            displayName: `Wallet First ${input.runtimeRequest.accountDigest.slice(0, 12)}`,
            nodeId: values.nodeId,
            expiresAt: input.successor.validUntil,
            note: marker
          }));
          assertTenantForInitial(tenant, input);
          const existingArtifacts = normalizeArtifactList(
            await runtimeCore.listSubscriptionArtifacts(tenant.id)
          );
          if (existingArtifacts.length !== 0) {
            throw adapterError("wallet_first_resource_effect_reconciliation_required");
          }
          const createdArtifact = normalizeCreatedArtifact(
            await runtimeCore.createSubscriptionArtifact(tenant.id)
          );
          artifact = createdArtifact.artifact;
          assertArtifactForTenant(artifact, tenant);
          // Capture immediately after Core creates the initial artifact. If this
          // fails, the catch below marks reconciliation before any receipt can
          // make the effect appear settled, and a replay only verifies this
          // exact deterministic binding rather than creating a second artifact.
          setupDeliverySummary = captureInitialSetupDeliveryEscrow(
            values.setupDeliveryRuntimeEscrow,
            input,
            tenant,
            artifact,
            createdArtifact.subscriptionUrl
          );
          const convergedArtifacts = normalizeArtifactList(
            await runtimeCore.listSubscriptionArtifacts(tenant.id)
          );
          if (convergedArtifacts.length !== 1 || convergedArtifacts[0].id !== artifact.id) {
            throw adapterError("wallet_first_resource_effect_reconciliation_required");
          }
        } else {
          if (observed.state === "target") {
            // A Core effect may have completed immediately before its durable
            // receipt write. The current generation only records after an
            // exact immutable probe; stale workers cannot win the CAS write.
          } else if (observed.state === "old") {
            tenant = normalizeTenant(await runtimeCore.renewTenant(tenant.id, {
              expiresAt: input.successor.validUntil
            }));
            assertTenantForScheduled(tenant, input);
            if (tenant.expiresAt !== input.successor.validUntil) {
              throw adapterError("wallet_first_resource_effect_reconciliation_required");
            }
          } else {
            throw adapterError("wallet_first_resource_effect_reconciliation_required");
          }
        }
      } catch (error) {
        if (error?.code === "wallet_first_resource_effect_reconciliation_required") {
          return markRuntimeReconciliation(
            control,
            input,
            lease,
            values.nodeId,
            values.nowFn,
            "runtime_claim_apply_drift"
          );
        }
        throw adapterError();
      }

      return recordRuntimeReceipt(
        control,
        input,
        lease,
        tenant,
        artifact,
        values.nodeId,
        values.nowFn,
        setupDeliverySummary
      );
    }
  });

  CONTROL_ADAPTER_INSTANCES.add(controlAdapter);
  RUNTIME_ADAPTER_INSTANCES.add(runtimeAdapter);
  return Object.freeze({ controlAdapter, runtimeAdapter });
}
