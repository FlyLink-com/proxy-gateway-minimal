import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

const ACCOUNT_REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const HANDOFF_REFERENCE = /^[a-z][a-z0-9_]{2,191}$/;
const RUNTIME_IDENTIFIER = /^[A-Za-z0-9_-]{3,128}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._~-]{15,127}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const ESCROW_VERSION = "wallet_first_setup_delivery_escrow_v1";
// Keep the handoff claim long enough for a user to import the delivered URL
// and acknowledge it, while remaining within the control-store's bounded
// lease contract. A later session may reclaim only after this lease expires.
const DELIVERY_LEASE_MS = 600_000;
const SERVICE_INSTANCES = new WeakSet();

function deliveryError(code = "wallet_first_setup_delivery_unavailable") {
  const error = new Error("Wallet-first setup delivery is unavailable");
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

function snapshotExactObject(value, fields, code) {
  try {
    if (!isPlainObject(value)) throw deliveryError(code);
    const expected = new Set(fields);
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length) throw deliveryError(code);
    const snapshot = {};
    for (const key of keys) {
      if (typeof key !== "string" || !expected.has(key)) {
        throw deliveryError(code);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw deliveryError(code);
      }
      snapshot[key] = descriptor.value;
    }
    for (const field of fields) {
      if (!Object.hasOwn(snapshot, field)) throw deliveryError(code);
    }
    return snapshot;
  } catch (error) {
    if (error?.code === code) throw error;
    throw deliveryError(code);
  }
}

function snapshotAllowedObject(value, fields, code) {
  try {
    if (!isPlainObject(value)) throw deliveryError(code);
    const allowed = new Set(fields);
    const snapshot = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !allowed.has(key)) throw deliveryError(code);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw deliveryError(code);
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch (error) {
    if (error?.code === code) throw error;
    throw deliveryError(code);
  }
}

function ownCallable(target, field, code) {
  try {
    if (
      !target
      || (typeof target !== "object" && typeof target !== "function")
      || utilTypes.isProxy(target)
    ) {
      throw deliveryError(code);
    }
    const descriptor = Object.getOwnPropertyDescriptor(target, field);
    if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "function") {
      throw deliveryError(code);
    }
    return descriptor.value;
  } catch (error) {
    if (error?.code === code) throw error;
    throw deliveryError(code);
  }
}

function normalizeReference(value, code) {
  if (typeof value !== "string" || !HANDOFF_REFERENCE.test(value)) {
    throw deliveryError(code);
  }
  return value;
}

function normalizeRuntimeIdentifier(value, code) {
  if (typeof value !== "string" || !RUNTIME_IDENTIFIER.test(value)) {
    throw deliveryError(code);
  }
  return value;
}

function normalizeAccountId(value, code) {
  if (typeof value !== "string" || !ACCOUNT_REFERENCE.test(value)) {
    throw deliveryError(code);
  }
  return value;
}

function normalizeSessionRef(value, code) {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 512
    || value.trim() !== value
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw deliveryError(code);
  }
  return value;
}

function normalizeIdempotencyKey(value, code) {
  if (typeof value !== "string" || !IDEMPOTENCY_KEY.test(value)) {
    throw deliveryError(code);
  }
  return value;
}

function snapshotBinding(value, code, expectedHandoffRef = null) {
  const binding = snapshotExactObject(value, [
    "handoffRef",
    "initialTransitionRef",
    "transitionRef",
    "effectRef",
    "tenantId",
    "artifactId",
    "tenantRef",
    "artifactRef"
  ], code);
  const handoffRef = normalizeReference(binding.handoffRef, code);
  if (expectedHandoffRef !== null && handoffRef !== expectedHandoffRef) {
    throw deliveryError(code);
  }
  for (const field of [
    "initialTransitionRef",
    "transitionRef",
    "effectRef",
    "tenantRef",
    "artifactRef"
  ]) normalizeReference(binding[field], code);
  for (const field of ["tenantId", "artifactId"]) {
    normalizeRuntimeIdentifier(binding[field], code);
  }
  return Object.freeze({
    handoffRef,
    initialTransitionRef: binding.initialTransitionRef,
    transitionRef: binding.transitionRef,
    effectRef: binding.effectRef,
    tenantId: binding.tenantId,
    artifactId: binding.artifactId,
    tenantRef: binding.tenantRef,
    artifactRef: binding.artifactRef
  });
}

function escrowBinding(binding) {
  return Object.freeze({
    transitionRef: binding.transitionRef,
    effectRef: binding.effectRef,
    tenantId: binding.tenantId,
    artifactId: binding.artifactId
  });
}

function hashValue(domain, value) {
  return createHash("sha256")
    .update(`${domain}\0`, "utf8")
    .update(value, "utf8")
    .digest("hex");
}

function normalizeNow(value, code) {
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw deliveryError(code);
    return date.toISOString();
  } catch (error) {
    if (error?.code === code) throw error;
    throw deliveryError(code);
  }
}

function safeNow(nowFn, code) {
  try {
    return normalizeNow(nowFn(), code);
  } catch (error) {
    if (error?.code === code) throw error;
    throw deliveryError(code);
  }
}

function snapshotControlStore(value) {
  const code = "wallet_first_setup_delivery_unavailable";
  const readAvailability = ownCallable(
    value,
    "readWalletFirstSetupDeliveryAvailabilityBinding",
    code
  );
  const claim = ownCallable(value, "claimWalletFirstSetupDeliveryHandoff", code);
  const readClaimedBinding = ownCallable(
    value,
    "readWalletFirstSetupDeliveryBinding",
    code
  );
  const readAcknowledgementBinding = ownCallable(
    value,
    "readWalletFirstSetupDeliveryAcknowledgementBinding",
    code
  );
  const acknowledge = ownCallable(
    value,
    "acknowledgeWalletFirstSetupDeliveryHandoff",
    code
  );
  const markReconciliation = ownCallable(
    value,
    "markWalletFirstSetupDeliveryHandoffReconciliationRequired",
    code
  );
  return Object.freeze({
    readAvailability: (input) => readAvailability.call(value, input),
    claim: (input) => claim.call(value, input),
    readClaimedBinding: (input) => readClaimedBinding.call(value, input),
    readAcknowledgementBinding: (input) => readAcknowledgementBinding.call(value, input),
    acknowledge: (input) => acknowledge.call(value, input),
    markReconciliation: (input) => markReconciliation.call(value, input)
  });
}

function snapshotDeliveryEscrow(value) {
  const code = "wallet_first_setup_delivery_unavailable";
  const getSummary = ownCallable(value, "getSetupDeliverySummary", code);
  const release = ownCallable(value, "releaseSetupDelivery", code);
  const acknowledge = ownCallable(value, "acknowledgeSetupDelivery", code);
  return Object.freeze({
    getSummary: (input) => getSummary.call(value, input),
    release: (input) => release.call(value, input),
    acknowledge: (input) => acknowledge.call(value, input)
  });
}

function callInternal(callback, code = "wallet_first_setup_delivery_unavailable") {
  try {
    return callback();
  } catch {
    throw deliveryError(code);
  }
}

function markReconciliationBestEffort(controlStore, {
  accountId,
  handoffRef,
  sessionBindingHash,
  now,
  safeCode
}) {
  try {
    controlStore.markReconciliation({
      accountId,
      handoffRef,
      sessionBindingHash,
      safeCode,
      now
    });
  } catch {
    // The original refusal remains fail-closed even if its durable safety
    // marker cannot be recorded because the control store is unavailable.
  }
}

function normalizeAvailability(value) {
  const code = "wallet_first_setup_delivery_unavailable";
  const status = snapshotAllowedObject(value, ["state", "handoffRef", "binding"], code);
  if (
    typeof status.state !== "string"
    || ![
      "none",
      "available",
      "claimed",
      "delivered",
      "reconciliation_required"
    ].includes(status.state)
  ) {
    throw deliveryError(code);
  }
  if (status.state === "available") {
    if (!Object.hasOwn(status, "handoffRef") || !Object.hasOwn(status, "binding")) {
      throw deliveryError(code);
    }
    return Object.freeze({
      state: "available",
      handoffRef: normalizeReference(status.handoffRef, code),
      binding: snapshotBinding(status.binding, code, status.handoffRef)
    });
  }
  if (Object.hasOwn(status, "handoffRef")) normalizeReference(status.handoffRef, code);
  if (Object.hasOwn(status, "binding")) {
    snapshotBinding(
      status.binding,
      code,
      Object.hasOwn(status, "handoffRef") ? status.handoffRef : null
    );
  }
  return Object.freeze({ state: status.state });
}

function normalizeClaim(value) {
  const code = "wallet_first_setup_delivery_unavailable";
  const status = snapshotAllowedObject(value, [
    "state",
    "handoffRef",
    "claimGeneration",
    "binding"
  ], code);
  if (status.state === "claimed") {
    if (
      !Object.hasOwn(status, "handoffRef")
      || !Object.hasOwn(status, "claimGeneration")
      || !Object.hasOwn(status, "binding")
      || !Number.isSafeInteger(status.claimGeneration)
      || status.claimGeneration < 1
    ) {
      throw deliveryError(code);
    }
    return Object.freeze({
      state: "claimed",
      handoffRef: normalizeReference(status.handoffRef, code),
      claimGeneration: status.claimGeneration,
      binding: snapshotBinding(status.binding, code, status.handoffRef)
    });
  }
  if (!["delivered", "reconciliation_required"].includes(status.state)) {
    throw deliveryError(code);
  }
  if (Object.hasOwn(status, "handoffRef")) normalizeReference(status.handoffRef, code);
  if (Object.hasOwn(status, "claimGeneration")) {
    if (!Number.isSafeInteger(status.claimGeneration) || status.claimGeneration < 1) {
      throw deliveryError(code);
    }
  }
  if (Object.hasOwn(status, "binding")) {
    snapshotBinding(
      status.binding,
      code,
      Object.hasOwn(status, "handoffRef") ? status.handoffRef : null
    );
  }
  return Object.freeze({ state: status.state });
}

function normalizeSessionBoundBinding(value, expectedHandoffRef) {
  const code = "wallet_first_setup_delivery_unavailable";
  const status = snapshotAllowedObject(value, [
    "state",
    "handoffRef",
    "binding",
    "claimGeneration"
  ], code);
  if (
    !Object.hasOwn(status, "state")
    || !Object.hasOwn(status, "handoffRef")
    || !Object.hasOwn(status, "binding")
  ) {
    throw deliveryError(code);
  }
  if (!["claimed", "delivered"].includes(status.state)) throw deliveryError(code);
  if (status.state === "claimed" && (
    !Number.isSafeInteger(status.claimGeneration) || status.claimGeneration < 1
  )) {
    throw deliveryError(code);
  }
  if (status.state === "delivered" && Object.hasOwn(status, "claimGeneration")) {
    throw deliveryError(code);
  }
  const handoffRef = normalizeReference(status.handoffRef, code);
  if (handoffRef !== expectedHandoffRef) throw deliveryError(code);
  return Object.freeze({
    state: status.state,
    handoffRef,
    binding: snapshotBinding(status.binding, code, handoffRef)
  });
}

function normalizeEscrowSummary(value, expectedHandoffRef) {
  const code = "wallet_first_setup_delivery_unavailable";
  const summary = snapshotExactObject(value, [
    "version",
    "state",
    "handoffRef",
    "bindingDigest",
    "resourceDigest"
  ], code);
  if (
    summary.version !== ESCROW_VERSION
    || !["available", "acknowledged"].includes(summary.state)
    || normalizeReference(summary.handoffRef, code) !== expectedHandoffRef
    || typeof summary.bindingDigest !== "string"
    || !SHA256_HEX.test(summary.bindingDigest)
    || typeof summary.resourceDigest !== "string"
    || !SHA256_HEX.test(summary.resourceDigest)
  ) {
    throw deliveryError(code);
  }
  return summary.state;
}

function normalizeSubscriptionUrl(value, code) {
  if (typeof value !== "string" || value.length < 1 || value.length > 4096) {
    throw deliveryError(code);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw deliveryError(code);
  }
  if (
    url.protocol !== "https:"
    || url.username !== ""
    || url.password !== ""
    || url.hash !== ""
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw deliveryError(code);
  }
  return value;
}

function normalizeReleasedDelivery(value, expectedHandoffRef) {
  const code = "wallet_first_setup_delivery_unavailable";
  const delivery = snapshotExactObject(value, ["handoffRef", "subscriptionUrl"], code);
  if (normalizeReference(delivery.handoffRef, code) !== expectedHandoffRef) {
    throw deliveryError(code);
  }
  return Object.freeze({
    handoffRef: expectedHandoffRef,
    subscriptionUrl: normalizeSubscriptionUrl(delivery.subscriptionUrl, code)
  });
}

function normalizeAcknowledgement(value, expectedHandoffRef) {
  const code = "wallet_first_setup_delivery_unavailable";
  const acknowledgement = snapshotExactObject(value, ["handoffRef", "status"], code);
  if (
    normalizeReference(acknowledgement.handoffRef, code) !== expectedHandoffRef
    || acknowledgement.status !== "acknowledged"
  ) {
    throw deliveryError(code);
  }
}

function normalizeControlAcknowledgement(value) {
  const code = "wallet_first_setup_delivery_unavailable";
  const acknowledgement = snapshotExactObject(value, ["state"], code);
  if (acknowledgement.state !== "delivered") throw deliveryError(code);
}

function requestForSetup(input) {
  const code = "validation_error";
  const request = snapshotExactObject(input, [
    "accountId",
    "sessionRef",
    "idempotencyKey"
  ], code);
  return Object.freeze({
    accountId: normalizeAccountId(request.accountId, code),
    sessionRef: normalizeSessionRef(request.sessionRef, code),
    idempotencyKey: normalizeIdempotencyKey(request.idempotencyKey, code)
  });
}

function requestForAcknowledgement(input) {
  const code = "validation_error";
  const request = snapshotExactObject(input, ["accountId", "sessionRef", "handoffRef"], code);
  return Object.freeze({
    accountId: normalizeAccountId(request.accountId, code),
    sessionRef: normalizeSessionRef(request.sessionRef, code),
    handoffRef: normalizeReference(request.handoffRef, code)
  });
}

function requestForAvailability(input) {
  const code = "wallet_first_setup_delivery_unavailable";
  const request = snapshotExactObject(input, ["accountId"], code);
  return Object.freeze({ accountId: normalizeAccountId(request.accountId, code) });
}

export function snapshotWalletFirstCurrentResourceSetupDelivery(value) {
  const code = "wallet_first_setup_delivery_unavailable";
  if (!SERVICE_INSTANCES.has(value)) throw deliveryError(code);
  const getSetupAvailability = ownCallable(value, "getSetupAvailability", code);
  const deliverSetup = ownCallable(value, "deliverSetup", code);
  const acknowledgeSetup = ownCallable(value, "acknowledgeSetup", code);
  return Object.freeze({
    getSetupAvailability: (input) => getSetupAvailability.call(value, input),
    deliverSetup: (input) => deliverSetup.call(value, input),
    acknowledgeSetup: (input) => acknowledgeSetup.call(value, input)
  });
}

/**
 * Creates the only wallet-first material-delivery boundary. It receives the
 * account/session context only from the authenticated Portal route, verifies
 * the durable control and escrow bindings for every action, and returns the
 * raw subscription URL only from a successful explicit setup request.
 */
export function createWalletFirstCurrentResourceSetupDelivery(options = {}) {
  const code = "wallet_first_setup_delivery_unavailable";
  const values = snapshotExactObject(options, ["controlStore", "deliveryEscrow", "nowFn"], code);
  if (typeof values.nowFn !== "function") throw deliveryError(code);
  const controlStore = snapshotControlStore(values.controlStore);
  const deliveryEscrow = snapshotDeliveryEscrow(values.deliveryEscrow);

  const service = Object.freeze({
    getSetupAvailability(input) {
      const request = requestForAvailability(input);
      const now = safeNow(values.nowFn, code);
      const availability = normalizeAvailability(callInternal(() => (
        controlStore.readAvailability({ accountId: request.accountId, now })
      ), code));
      if (availability.state !== "available") return false;
      const escrowState = normalizeEscrowSummary(callInternal(() => (
        deliveryEscrow.getSummary(escrowBinding(availability.binding))
      ), code), availability.handoffRef);
      return escrowState === "available";
    },

    deliverSetup(input) {
      const request = requestForSetup(input);
      const now = safeNow(values.nowFn, code);
      const sessionBindingHash = hashValue(
        "GCCWEBOS:WALLET_FIRST_SETUP_DELIVERY_SESSION:v1",
        request.sessionRef
      );
      const idempotencyKeyHash = hashValue(
        "GCCWEBOS:WALLET_FIRST_SETUP_DELIVERY_IDEMPOTENCY:v1",
        request.idempotencyKey
      );
      const claim = normalizeClaim(callInternal(() => controlStore.claim({
        accountId: request.accountId,
        idempotencyKeyHash,
        sessionBindingHash,
        now,
        leaseMs: DELIVERY_LEASE_MS
      }), code));
      if (claim.state === "reconciliation_required") {
        throw deliveryError("wallet_first_setup_delivery_reconciliation_required");
      }
      if (claim.state !== "claimed") throw deliveryError(code);
      try {
        const claimed = normalizeSessionBoundBinding(callInternal(() => (
          controlStore.readClaimedBinding({
            accountId: request.accountId,
            handoffRef: claim.handoffRef,
            sessionBindingHash,
            now
          })
        ), code), claim.handoffRef);
        if (claimed.state !== "claimed") throw deliveryError(code);
        const escrowState = normalizeEscrowSummary(callInternal(() => (
          deliveryEscrow.getSummary(escrowBinding(claimed.binding))
        ), code), claimed.handoffRef);
        if (escrowState !== "available") throw deliveryError(code);
        const released = normalizeReleasedDelivery(callInternal(() => (
          deliveryEscrow.release({
            handoffRef: claimed.handoffRef,
            ...escrowBinding(claimed.binding)
          })
        ), code), claimed.handoffRef);
        return Object.freeze({
          delivery: Object.freeze({
            handoffRef: released.handoffRef,
            kind: "subscription_url",
            subscriptionUrl: released.subscriptionUrl
          })
        });
      } catch {
        markReconciliationBestEffort(controlStore, {
          accountId: request.accountId,
          handoffRef: claim.handoffRef,
          sessionBindingHash,
          now,
          safeCode: "delivery_binding_unverified"
        });
        throw deliveryError("wallet_first_setup_delivery_reconciliation_required");
      }
    },

    acknowledgeSetup(input) {
      const request = requestForAcknowledgement(input);
      const now = safeNow(values.nowFn, code);
      const sessionBindingHash = hashValue(
        "GCCWEBOS:WALLET_FIRST_SETUP_DELIVERY_SESSION:v1",
        request.sessionRef
      );
      let sessionBound;
      try {
        sessionBound = normalizeSessionBoundBinding(callInternal(() => (
          controlStore.readAcknowledgementBinding({
            accountId: request.accountId,
            handoffRef: request.handoffRef,
            sessionBindingHash,
            now
          })
        ), code), request.handoffRef);
      } catch {
        throw deliveryError("wallet_first_setup_delivery_reconciliation_required");
      }
      let controlAcknowledged = false;
      try {
        const escrowState = normalizeEscrowSummary(callInternal(() => (
          deliveryEscrow.getSummary(escrowBinding(sessionBound.binding))
        ), code), sessionBound.handoffRef);
        normalizeControlAcknowledgement(callInternal(() => controlStore.acknowledge({
          accountId: request.accountId,
          handoffRef: sessionBound.handoffRef,
          sessionBindingHash,
          now
        }), code));
        controlAcknowledged = true;
        if (escrowState === "acknowledged") return;
        normalizeAcknowledgement(callInternal(() => deliveryEscrow.acknowledge({
          handoffRef: sessionBound.handoffRef,
          ...escrowBinding(sessionBound.binding)
        }), code), sessionBound.handoffRef);
      } catch {
        if (!controlAcknowledged && sessionBound.state === "claimed") {
          markReconciliationBestEffort(controlStore, {
            accountId: request.accountId,
            handoffRef: sessionBound.handoffRef,
            sessionBindingHash,
            now,
            safeCode: "ack_binding_unverified"
          });
          throw deliveryError("wallet_first_setup_delivery_reconciliation_required");
        }
        // Once control is durable-delivered, leave its same-session binding in
        // place. A later ack retries only escrow cleanup and can never reveal
        // material again.
        throw deliveryError(code);
      }
    }
  });
  SERVICE_INSTANCES.add(service);
  return service;
}
