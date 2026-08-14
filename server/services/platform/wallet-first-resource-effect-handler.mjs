import { types as utilTypes } from "node:util";

import {
  normalizeCoinCommerceOffer
} from "./coin-commerce-domain.mjs";
import {
  snapshotWalletFirstResourceEffectControlAdapter,
  snapshotWalletFirstResourceEffectRuntimeAdapter
} from "./wallet-first-resource-effect-adapter.mjs";

/**
 * This handler is intentionally a separate effect family.  It never accepts
 * nor calls an ordinary Commerce order/fulfillment API.  The coordinator
 * gives it an opaque deferred order reference for audit correlation, which is
 * validated then deliberately discarded before either adapter is invoked.
 */
export const WALLET_FIRST_RESOURCE_EFFECT_HANDLER_IDEMPOTENCY_CONTRACT =
  "deduplicate_by_transition_ref";
export const WALLET_FIRST_RESOURCE_EFFECT_CONTROL_IDEMPOTENCY_CONTRACT =
  "deduplicate_by_transition_ref";
export const WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_IDEMPOTENCY_CONTRACT =
  "deduplicate_by_transition_ref";

export const WALLET_FIRST_RESOURCE_EFFECT_HANDLER_METHODS = Object.freeze([
  "revalidateDeferredResourceTransition",
  "resolveDeferredResourceTransitionEffect",
  "applyDeferredResourceTransition"
]);

const OPTION_FIELDS = Object.freeze(["controlAdapter", "runtimeAdapter"]);
const REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const ISO_UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const WALLET_FIRST_MODEL = "wallet_first_unique_v1";

function effectError(code) {
  const error = new Error("Wallet-first resource effect rejected operation");
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

function exactObject(value, fields, code) {
  try {
    if (!isPlainObject(value)) throw effectError(code);
    const expected = new Set(fields);
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length) throw effectError(code);
    const result = {};
    for (const key of keys) {
      if (typeof key !== "string" || !expected.has(key)) {
        throw effectError(code);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw effectError(code);
      }
      result[key] = descriptor.value;
    }
    for (const field of fields) {
      if (!Object.hasOwn(result, field)) throw effectError(code);
    }
    return result;
  } catch (error) {
    if (error?.code === code) throw error;
    throw effectError(code);
  }
}

function snapshotJson(value, code, depth = 0) {
  if (depth > 32) throw effectError(code);
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw effectError(code);
    return value;
  }
  if (Array.isArray(value)) {
    if (
      utilTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Array.prototype
      || Reflect.ownKeys(value).length !== value.length + 1
    ) {
      throw effectError(code);
    }
    const output = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw effectError(code);
      }
      output.push(snapshotJson(descriptor.value, code, depth + 1));
    }
    return Object.freeze(output);
  }
  if (!isPlainObject(value)) throw effectError(code);
  const output = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw effectError(code);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw effectError(code);
    }
    output[key] = snapshotJson(descriptor.value, code, depth + 1);
  }
  return Object.freeze(output);
}

function reference(value, code) {
  if (typeof value !== "string" || !REFERENCE.test(value)) {
    throw effectError(code);
  }
  return value;
}

function timestamp(value, code) {
  if (
    typeof value !== "string"
    || !ISO_UTC_MILLIS.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw effectError(code);
  }
  return value;
}

function nullableReference(value, code) {
  return value === null ? null : reference(value, code);
}

function nullableTimestamp(value, code) {
  return value === null ? null : timestamp(value, code);
}

function normalizeOffer(value) {
  const code = "wallet_first_resource_effect_invalid";
  let offer;
  try {
    offer = normalizeCoinCommerceOffer(snapshotJson(value, code));
  } catch {
    throw effectError(code);
  }
  if (
    offer.category !== "plan"
    || offer.delivery.kind !== "subscription_plan"
  ) {
    throw effectError(code);
  }
  // This is the only full Commerce-offer ingress to the resource-effect
  // family. The downstream adapters retain their exact three-field plan
  // contract and therefore cannot accidentally acquire ordinary Commerce
  // pricing, allocation, or fulfillment semantics.
  return Object.freeze({
    offerVersionRef: offer.offerVersionRef,
    durationDays: offer.delivery.durationDays,
    monthlyTrafficGb: offer.delivery.monthlyTrafficGb
  });
}

function normalizeEffectInput(value) {
  const code = "wallet_first_resource_effect_invalid";
  const input = exactObject(value, [
    "transitionRef",
    "accountId",
    "orderRef",
    "flowKind",
    "offer",
    "scheduledFor",
    "expectedEntitlementId",
    "expectedRequestId",
    "expectedIssuedLinkId",
    "expectedValidUntil",
    "activationAt"
  ], code);
  // This is an opaque deferred-store reference. It must be valid but is not
  // returned nor sent to either adapter, preventing ordinary order reuse.
  reference(input.orderRef, code);
  const normalized = {
    transitionRef: reference(input.transitionRef, code),
    accountId: reference(input.accountId, code),
    flowKind: input.flowKind,
    offer: normalizeOffer(input.offer),
    scheduledFor: timestamp(input.scheduledFor, code),
    expectedEntitlementId: nullableReference(input.expectedEntitlementId, code),
    expectedRequestId: nullableReference(input.expectedRequestId, code),
    expectedIssuedLinkId: nullableReference(input.expectedIssuedLinkId, code),
    expectedValidUntil: nullableTimestamp(input.expectedValidUntil, code),
    activationAt: timestamp(input.activationAt, code)
  };
  const expectedChain = [
    normalized.expectedEntitlementId,
    normalized.expectedRequestId,
    normalized.expectedIssuedLinkId,
    normalized.expectedValidUntil
  ];
  if (
    !["initial_activation", "scheduled_switch"].includes(normalized.flowKind)
    || (normalized.flowKind === "initial_activation" && expectedChain.some((item) => item !== null))
    || (normalized.flowKind === "scheduled_switch" && expectedChain.some((item) => item === null))
    || (
      normalized.flowKind === "scheduled_switch"
      && normalized.scheduledFor !== normalized.expectedValidUntil
    )
  ) {
    throw effectError(code);
  }
  return Object.freeze(normalized);
}

function normalizeEffectLookupInput(value) {
  const code = "wallet_first_resource_effect_invalid";
  const input = exactObject(value, ["transitionRef"], code);
  return Object.freeze({ transitionRef: reference(input.transitionRef, code) });
}

function normalizeAccountLookupInput(value) {
  const code = "wallet_first_resource_effect_invalid";
  const input = exactObject(value, ["accountId"], code);
  return Object.freeze({ accountId: reference(input.accountId, code) });
}

function normalizeEffect(value, code = "wallet_first_resource_effect_unavailable") {
  const input = exactObject(value, [
    "status",
    "effectRef",
    "nextEntitlementId",
    "nextRequestId",
    "nextIssuedLinkId",
    "nextValidUntil"
  ], code);
  if (input.status !== "applied") throw effectError(code);
  return Object.freeze({
    status: "applied",
    effectRef: reference(input.effectRef, code),
    nextEntitlementId: reference(input.nextEntitlementId, code),
    nextRequestId: reference(input.nextRequestId, code),
    nextIssuedLinkId: reference(input.nextIssuedLinkId, code),
    nextValidUntil: timestamp(input.nextValidUntil, code)
  });
}

function successorFromEffect(effect) {
  return Object.freeze({
    entitlementId: effect.nextEntitlementId,
    requestId: effect.nextRequestId,
    issuedLinkId: effect.nextIssuedLinkId,
    validUntil: effect.nextValidUntil
  });
}

function assertWalletFirstAccount(control, accountId) {
  const code = "wallet_first_resource_effect_account_invalid";
  let raw;
  try {
    raw = control.getWalletFirstAccount({ accountId });
  } catch {
    throw effectError(code);
  }
  const account = exactObject(raw, ["accountId", "status", "commercialModel"], code);
  if (
    account.accountId !== accountId
    || account.status !== "active"
    || account.commercialModel !== WALLET_FIRST_MODEL
  ) {
    throw effectError(code);
  }
}

function resolveExactChain(control, accountId) {
  const code = "wallet_first_resource_effect_chain_invalid";
  let raw;
  try {
    raw = control.resolveExactWalletFirstResourceChain({ accountId });
  } catch {
    throw effectError(code);
  }
  try {
    if (!isPlainObject(raw)) throw effectError(code);
    const state = Object.getOwnPropertyDescriptor(raw, "state");
    if (!state || !state.enumerable || !("value" in state)) throw effectError(code);
    if (state.value === "none") {
      const chain = exactObject(raw, ["state", "activeChainCount"], code);
      if (chain.activeChainCount !== 0) throw effectError(code);
      return Object.freeze({ state: "none" });
    }
    if (state.value === "current") {
      const chain = exactObject(raw, [
        "state",
        "activeChainCount",
        "entitlementId",
        "requestId",
        "issuedLinkId",
        "validUntil"
      ], code);
      if (chain.activeChainCount !== 1) throw effectError(code);
      return Object.freeze({
        state: "current",
        entitlementId: reference(chain.entitlementId, code),
        requestId: reference(chain.requestId, code),
        issuedLinkId: reference(chain.issuedLinkId, code),
        validUntil: timestamp(chain.validUntil, code)
      });
    }
    throw effectError(code);
  } catch (error) {
    if (error?.code === code) throw error;
    throw effectError(code);
  }
}

function chainMatches(input, chain) {
  if (input.flowKind === "initial_activation") {
    return chain.state === "none";
  }
  return (
    chain.state === "current"
    && chain.entitlementId === input.expectedEntitlementId
    && chain.requestId === input.expectedRequestId
    && chain.issuedLinkId === input.expectedIssuedLinkId
    && chain.validUntil === input.expectedValidUntil
    && input.scheduledFor === input.expectedValidUntil
  );
}

function normalizePreparation(value, input) {
  const code = "wallet_first_resource_effect_unavailable";
  const prepared = exactObject(value, [
    "transitionRef",
    "effectRef",
    "successor",
    "runtimeRequest"
  ], code);
  const successor = exactObject(prepared.successor, [
    "entitlementId", "requestId", "issuedLinkId", "validUntil"
  ], code);
  if (prepared.transitionRef !== input.transitionRef) throw effectError(code);
  return Object.freeze({
    transitionRef: input.transitionRef,
    effectRef: reference(prepared.effectRef, code),
    successor: Object.freeze({
      entitlementId: reference(successor.entitlementId, code),
      requestId: reference(successor.requestId, code),
      issuedLinkId: reference(successor.issuedLinkId, code),
      validUntil: timestamp(successor.validUntil, code)
    }),
    runtimeRequest: snapshotJson(prepared.runtimeRequest, code)
  });
}

function normalizeRuntimeReceipt(value, transitionRef) {
  const code = "wallet_first_resource_effect_unavailable";
  const receipt = exactObject(value, ["transitionRef", "runtimeReceiptRef"], code);
  if (receipt.transitionRef !== transitionRef) throw effectError(code);
  return Object.freeze({
    transitionRef,
    runtimeReceiptRef: reference(receipt.runtimeReceiptRef, code)
  });
}

function sameSuccessor(left, right) {
  return (
    left.entitlementId === right.entitlementId
    && left.requestId === right.requestId
    && left.issuedLinkId === right.issuedLinkId
    && left.validUntil === right.validUntil
  );
}

/**
 * Constructs the narrow effect bridge consumed by
 * `createDeferredResourceTransitionCoordinator`.  `controlAdapter` owns its
 * own immediate transaction for `prepare`/`complete`; its prepared intent,
 * and the runtime adapter, must each deduplicate by `transitionRef`.  Thus an
 * effect cannot be silently replayed after a crash.  Any ambiguous account or
 * resource-chain result throws instead of selecting one arbitrarily.
 */
export function createWalletFirstResourceEffectHandler(options = {}) {
  const values = exactObject(
    options,
    OPTION_FIELDS,
    "wallet_first_resource_effect_invalid"
  );
  const control = snapshotWalletFirstResourceEffectControlAdapter(
    values.controlAdapter
  );
  const runtime = snapshotWalletFirstResourceEffectRuntimeAdapter(
    values.runtimeAdapter
  );

  function revalidateDeferredResourceTransition(value) {
    const input = normalizeEffectInput(value);
    assertWalletFirstAccount(control, input.accountId);
    const chain = resolveExactChain(control, input.accountId);
    if (!chainMatches(input, chain)) {
      return Object.freeze({
        status: "requote_required",
        safeCode: "wallet_first_chain_changed"
      });
    }
    return Object.freeze({ status: "ready" });
  }

  /**
   * This is the only resource-chain reader exposed to the checkout surface.
   * It is deliberately derived from the same marker and exact-chain adapter
   * used at effect time, so a preview cannot classify an ambiguous account as
   * an initial activation.  It exposes no count, identifiers for a `none`
   * state, or mutable priority/snapshot controls to the Portal caller.
   */
  function resolveCurrentResourceChain(value) {
    const input = normalizeAccountLookupInput(value);
    assertWalletFirstAccount(control, input.accountId);
    const chain = resolveExactChain(control, input.accountId);
    if (chain.state === "none") {
      return Object.freeze({ state: "none" });
    }
    return Object.freeze({
      state: "current",
      entitlementId: chain.entitlementId,
      requestId: chain.requestId,
      issuedLinkId: chain.issuedLinkId,
      validUntil: chain.validUntil
    });
  }

  async function resolveDeferredResourceTransitionEffect(value) {
    const input = normalizeEffectLookupInput(value);
    let raw;
    try {
      raw = await control.getWalletFirstTransitionEffect({
        transitionRef: input.transitionRef
      });
    } catch {
      throw effectError("wallet_first_resource_effect_unavailable");
    }
    if (raw === null) return null;
    const effect = normalizeEffect(raw);
    try {
      await runtime.verifyWalletFirstTransition(Object.freeze({
        transitionRef: input.transitionRef,
        effectRef: effect.effectRef,
        successor: successorFromEffect(effect)
      }));
    } catch {
      // A durable control receipt is not enough by itself. The concrete
      // runtime must still prove the marked tenant/artifact is healthy before
      // a restart may capture or expose that prior effect as settled.
      throw effectError("wallet_first_resource_effect_unavailable");
    }
    return effect;
  }

  async function applyDeferredResourceTransition(value) {
    const input = normalizeEffectInput(value);
    const known = await resolveDeferredResourceTransitionEffect({
      transitionRef: input.transitionRef
    });
    if (known !== null) return known;
    const assessment = revalidateDeferredResourceTransition(value);
    if (assessment.status !== "ready") {
      throw effectError("wallet_first_resource_effect_chain_changed");
    }
    const common = Object.freeze({
      transitionRef: input.transitionRef,
      accountId: input.accountId,
      offer: input.offer,
      scheduledFor: input.scheduledFor,
      activationAt: input.activationAt
    });
    let rawPreparation;
    try {
      rawPreparation = input.flowKind === "initial_activation"
        ? await control.prepareWalletFirstInitialActivation(common)
        : await control.prepareWalletFirstScheduledSwitch(Object.freeze({
          ...common,
          expectedChain: Object.freeze({
            entitlementId: input.expectedEntitlementId,
            requestId: input.expectedRequestId,
            issuedLinkId: input.expectedIssuedLinkId,
            validUntil: input.expectedValidUntil
          })
        }));
    } catch {
      throw effectError("wallet_first_resource_effect_unavailable");
    }
    const prepared = normalizePreparation(rawPreparation, input);
    let rawRuntimeReceipt;
    try {
      rawRuntimeReceipt = await runtime.applyWalletFirstTransition(Object.freeze({
        transitionRef: input.transitionRef,
        flowKind: input.flowKind,
        successor: prepared.successor,
        runtimeRequest: prepared.runtimeRequest
      }));
    } catch (error) {
      // A different live runtime-claim lease is a normal transient condition.
      // Preserve it for the deferred coordinator so it can retain the outer
      // transition for a later retry rather than falsely terminally reconcile.
      if (error?.code === "wallet_first_resource_effect_retryable") {
        throw effectError("wallet_first_resource_effect_retryable");
      }
      throw effectError("wallet_first_resource_effect_unavailable");
    }
    const runtimeReceipt = normalizeRuntimeReceipt(
      rawRuntimeReceipt,
      input.transitionRef
    );
    let rawEffect;
    try {
      rawEffect = await control.completeWalletFirstTransitionEffect(Object.freeze({
        transitionRef: input.transitionRef,
        effectRef: prepared.effectRef,
        successor: prepared.successor,
        runtimeReceiptRef: runtimeReceipt.runtimeReceiptRef
      }));
    } catch {
      throw effectError("wallet_first_resource_effect_unavailable");
    }
    const effect = normalizeEffect(rawEffect);
    if (
      effect.effectRef !== prepared.effectRef
      || !sameSuccessor(successorFromEffect(effect), prepared.successor)
    ) {
      throw effectError("wallet_first_resource_effect_unavailable");
    }
    return effect;
  }

  return Object.freeze({
    idempotencyContract: WALLET_FIRST_RESOURCE_EFFECT_HANDLER_IDEMPOTENCY_CONTRACT,
    resolveCurrentResourceChain,
    revalidateDeferredResourceTransition,
    resolveDeferredResourceTransitionEffect,
    applyDeferredResourceTransition
  });
}
