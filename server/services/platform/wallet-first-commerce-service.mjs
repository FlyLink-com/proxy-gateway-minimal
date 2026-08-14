import { types as utilTypes } from "node:util";

/**
 * This boundary deliberately contains no Wallet mutation or resource effect.
 * It only makes the per-account commercial-model decision and snapshots the
 * dedicated deferred-transition service contract. Runtime composition remains
 * fail-closed until the independent reservation participant and effect handler
 * are available.
 */
export const WALLET_FIRST_COMMERCIAL_MODEL = "wallet_first_unique_v1";
export const PORTAL_COMMERCE_MODE_LEGACY = "legacy";
export const PORTAL_COMMERCE_MODE_WALLET_FIRST =
  WALLET_FIRST_COMMERCIAL_MODEL;

export const WALLET_FIRST_COMMERCE_SERVICE_METHODS = Object.freeze([
  "listOffers",
  "getOffer",
  "previewDeferredCheckout",
  "reserveDeferredTransition",
  "listDeferredTransitions",
  "getDeferredTransition",
  "cancelDeferredTransition"
]);

const ACCOUNT_REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{1,128}$/;
const ISO_UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DEFERRED_TRANSITION_STATES = new Set([
  "reserved",
  "processing",
  "effect_applied",
  "settled",
  "requote_required",
  "cancelled",
  "reconciliation_required"
]);
const DEFERRED_TRANSITION_PUBLIC_FIELDS = Object.freeze([
  "transitionRef",
  "offer",
  "amountUnits",
  "flowKind",
  "scheduledFor",
  "state",
  "safeCode",
  "reservedAt",
  "settledAt",
  "createdAt",
  "updatedAt"
]);
const DEFERRED_TRANSITION_STORE_FIELDS = Object.freeze([
  "transitionRef",
  "orderRef",
  "reservationRef",
  "offer",
  "amountUnits",
  "flowKind",
  "planRank",
  "scheduledFor",
  "expectedValidUntil",
  "state",
  "rebaseGeneration",
  "effectRef",
  "safeCode",
  "reservedAt",
  "settledAt",
  "createdAt",
  "updatedAt"
]);
const ACCOUNT_FIELDS = Object.freeze([
  "id",
  "ownerRef",
  "status",
  "createdAt",
  "updatedAt",
  "metadata"
]);
const OPERATION_FIELDS = Object.freeze([
  "actorScope",
  "idempotencyKey",
  "actorType",
  "actorRef"
]);
const SERVICE_INSTANCES = new WeakSet();

function serviceError(code) {
  const error = new Error("Wallet-first Commerce service is unavailable");
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
    if (!isPlainObject(value)) throw serviceError(code);
    const expected = new Set(fields);
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length) throw serviceError(code);
    const snapshot = {};
    for (const key of keys) {
      if (typeof key !== "string" || !expected.has(key)) {
        throw serviceError(code);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw serviceError(code);
      }
      snapshot[key] = descriptor.value;
    }
    for (const field of fields) {
      if (!Object.hasOwn(snapshot, field)) throw serviceError(code);
    }
    return snapshot;
  } catch (error) {
    if (error?.code === code) throw error;
    throw serviceError(code);
  }
}

function snapshotMetadataCommercialModel(value, code) {
  try {
    if (!isPlainObject(value)) throw serviceError(code);
    const descriptor = Object.getOwnPropertyDescriptor(value, "commercialModel");
    if (!descriptor) return null;
    if (!descriptor.enumerable || !("value" in descriptor)) {
      throw serviceError(code);
    }
    return descriptor.value;
  } catch (error) {
    if (error?.code === code) throw error;
    throw serviceError(code);
  }
}

function ownCallable(target, field, code) {
  try {
    if (
      !target
      || (typeof target !== "object" && typeof target !== "function")
      || utilTypes.isProxy(target)
    ) {
      throw serviceError(code);
    }
    const descriptor = Object.getOwnPropertyDescriptor(target, field);
    if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "function") {
      throw serviceError(code);
    }
    return descriptor.value;
  } catch (error) {
    if (error?.code === code) throw error;
    throw serviceError(code);
  }
}

function normalizeAccountId(value, code) {
  if (typeof value !== "string" || !ACCOUNT_REFERENCE.test(value)) {
    throw serviceError(code);
  }
  return value;
}

function normalizeReference(value, code) {
  if (typeof value !== "string" || !ACCOUNT_REFERENCE.test(value)) {
    throw serviceError(code);
  }
  return value;
}

function normalizeTimestamp(value, code) {
  if (
    typeof value !== "string"
    || !ISO_UTC_MILLIS.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw serviceError(code);
  }
  return value;
}

function normalizeOperation(value, code) {
  const operation = snapshotExactObject(value, OPERATION_FIELDS, code);
  if (
    typeof operation.actorScope !== "string"
    || operation.actorScope.length === 0
    || operation.actorScope.trim() !== operation.actorScope
    || typeof operation.actorType !== "string"
    || operation.actorType.length === 0
    || operation.actorType.trim() !== operation.actorType
    || typeof operation.actorRef !== "string"
    || operation.actorRef.length === 0
    || operation.actorRef.trim() !== operation.actorRef
    || typeof operation.idempotencyKey !== "string"
    || !IDEMPOTENCY_KEY.test(operation.idempotencyKey)
  ) {
    throw serviceError(code);
  }
  return Object.freeze(operation);
}

function snapshotResourceChainResolver(value) {
  const code = "wallet_first_commerce_resource_chain_unavailable";
  const callable = ownCallable(value, "resolveCurrentResourceChain", code);
  return Object.freeze({
    resolveCurrentResourceChain: (input) => callable.call(value, input)
  });
}

function normalizeResourceChain(value) {
  const code = "wallet_first_commerce_resource_chain_unavailable";
  const state = (() => {
    try {
      if (!isPlainObject(value)) throw serviceError(code);
      const descriptor = Object.getOwnPropertyDescriptor(value, "state");
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw serviceError(code);
      }
      return descriptor.value;
    } catch (error) {
      if (error?.code === code) throw error;
      throw serviceError(code);
    }
  })();
  if (state === "none") {
    snapshotExactObject(value, ["state"], code);
    return Object.freeze({ state });
  }
  if (state === "current") {
    const chain = snapshotExactObject(value, [
      "state",
      "entitlementId",
      "requestId",
      "issuedLinkId",
      "validUntil"
    ], code);
    return Object.freeze({
      state,
      entitlementId: normalizeReference(chain.entitlementId, code),
      requestId: normalizeReference(chain.requestId, code),
      issuedLinkId: normalizeReference(chain.issuedLinkId, code),
      validUntil: normalizeTimestamp(chain.validUntil, code)
    });
  }
  throw serviceError(code);
}

function nextActivationTimestamp(nowFn) {
  let now;
  try {
    now = nowFn();
  } catch {
    throw serviceError("wallet_first_commerce_resource_chain_unavailable");
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw serviceError("wallet_first_commerce_resource_chain_unavailable");
  }
  return now.toISOString();
}

function deriveTransitionContext({ accountId, resourceChainResolver, nowFn }) {
  let resolved;
  try {
    resolved = resourceChainResolver.resolveCurrentResourceChain({ accountId });
  } catch {
    throw serviceError("wallet_first_commerce_resource_chain_unavailable");
  }
  const chain = normalizeResourceChain(resolved);
  if (chain.state === "none") {
    return Object.freeze({
      flowKind: "initial_activation",
      scheduledFor: nextActivationTimestamp(nowFn),
      expectedEntitlementId: null,
      expectedRequestId: null,
      expectedIssuedLinkId: null,
      expectedValidUntil: null
    });
  }
  return Object.freeze({
    flowKind: "scheduled_switch",
    scheduledFor: chain.validUntil,
    expectedEntitlementId: chain.entitlementId,
    expectedRequestId: chain.requestId,
    expectedIssuedLinkId: chain.issuedLinkId,
    expectedValidUntil: chain.validUntil
  });
}

function projectPublicDeferredTransition(value, code) {
  try {
    if (!isPlainObject(value)) throw serviceError(code);
    const keys = Reflect.ownKeys(value);
    const fields = keys.length === DEFERRED_TRANSITION_PUBLIC_FIELDS.length
      ? DEFERRED_TRANSITION_PUBLIC_FIELDS
      : keys.length === DEFERRED_TRANSITION_STORE_FIELDS.length
        ? DEFERRED_TRANSITION_STORE_FIELDS
        : null;
    if (!fields) throw serviceError(code);
    const source = snapshotExactObject(value, fields, code);
    if (
      !isPlainObject(source.offer)
      || !Number.isSafeInteger(source.amountUnits)
      || source.amountUnits < 1
      || !["initial_activation", "scheduled_switch"].includes(source.flowKind)
      || !DEFERRED_TRANSITION_STATES.has(source.state)
      || typeof source.safeCode !== "string" && source.safeCode !== null
      || typeof source.reservedAt !== "string"
      || source.settledAt !== null && typeof source.settledAt !== "string"
      || typeof source.createdAt !== "string"
      || typeof source.updatedAt !== "string"
    ) {
      throw serviceError(code);
    }
    normalizeReference(source.transitionRef, code);
    normalizeTimestamp(source.scheduledFor, code);
    normalizeTimestamp(source.reservedAt, code);
    if (source.settledAt !== null) normalizeTimestamp(source.settledAt, code);
    normalizeTimestamp(source.createdAt, code);
    normalizeTimestamp(source.updatedAt, code);
    return Object.freeze(Object.fromEntries(
      DEFERRED_TRANSITION_PUBLIC_FIELDS.map((field) => [field, source[field]])
    ));
  } catch (error) {
    if (error?.code === code) throw error;
    throw serviceError(code);
  }
}

function projectPublicDeferredTransitionList(value, code) {
  try {
    if (
      !Array.isArray(value)
      || utilTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Array.prototype
    ) {
      throw serviceError(code);
    }
    return Object.freeze(value.map((transition) => (
      projectPublicDeferredTransition(transition, code)
    )));
  } catch (error) {
    if (error?.code === code) throw error;
    throw serviceError(code);
  }
}

function assertResultTransitionContext(value, context, { checkout = false } = {}) {
  const code = "wallet_first_commerce_service_unavailable";
  let transition;
  try {
    if (!isPlainObject(value)) throw serviceError(code);
    const field = checkout ? "transition" : null;
    const source = field === null
      ? value
      : (() => {
        const descriptor = Object.getOwnPropertyDescriptor(value, field);
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          throw serviceError(code);
        }
        return descriptor.value;
      })();
    transition = checkout
      ? snapshotExactObject(source, ["flowKind", "scheduledFor"], code)
      : projectPublicDeferredTransition(source, code);
  } catch (error) {
    if (error?.code === code) throw error;
    throw serviceError(code);
  }
  if (
    !["initial_activation", "scheduled_switch"].includes(transition.flowKind)
    || normalizeTimestamp(transition.scheduledFor, code) !== transition.scheduledFor
  ) {
    throw serviceError(code);
  }
  if (
    context !== null
    && (
      transition.flowKind !== context.flowKind
      || transition.scheduledFor !== context.scheduledFor
    )
  ) {
    throw serviceError(code);
  }
  return checkout ? value : transition;
}

/**
 * A reconciliation-required transition represents an unresolved prior wallet
 * effect for the same account.  Quote or reserve must not create another
 * effect chain around it.  The deferred store repeats this invariant during
 * mutation; this service preflight preserves it across every adapter.
 */
function assertNoDeferredReconciliationRequired(surface, accountId) {
  const unavailable = "wallet_first_commerce_service_unavailable";
  let transitions;
  try {
    transitions = surface.listDeferredTransitions(Object.freeze({ accountId }));
    if (
      !Array.isArray(transitions)
      || utilTypes.isProxy(transitions)
      || Object.getPrototypeOf(transitions) !== Array.prototype
    ) {
      throw serviceError(unavailable);
    }
    const length = Object.getOwnPropertyDescriptor(transitions, "length");
    if (
      !length
      || !("value" in length)
      || !Number.isSafeInteger(length.value)
      || length.value < 0
      || Reflect.ownKeys(transitions).length !== length.value + 1
    ) {
      throw serviceError(unavailable);
    }
    for (let index = 0; index < length.value; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(transitions, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw serviceError(unavailable);
      }
      const transition = descriptor.value;
      if (!isPlainObject(transition)) throw serviceError(unavailable);
      const state = Object.getOwnPropertyDescriptor(transition, "state");
      if (
        !state
        || !state.enumerable
        || !("value" in state)
        || !DEFERRED_TRANSITION_STATES.has(state.value)
      ) {
        throw serviceError(unavailable);
      }
      if (state.value === "reconciliation_required") {
        throw serviceError("reconciliation_required");
      }
    }
  } catch (error) {
    if (
      error?.code === "reconciliation_required"
      || error?.code === unavailable
    ) {
      throw error;
    }
    throw serviceError(unavailable);
  }
}

function normalizeListOffersRequest(input) {
  const value = snapshotExactObject(input, ["accountId"], "wallet_first_commerce_service_invalid");
  return Object.freeze({
    accountId: normalizeAccountId(value.accountId, "wallet_first_commerce_service_invalid")
  });
}

function normalizeOfferRequest(input) {
  const value = snapshotExactObject(input, ["accountId", "offerRef"], "wallet_first_commerce_service_invalid");
  return Object.freeze({
    accountId: normalizeAccountId(value.accountId, "wallet_first_commerce_service_invalid"),
    offerRef: normalizeReference(value.offerRef, "wallet_first_commerce_service_invalid")
  });
}

function normalizeReserveRequest(input) {
  const value = snapshotExactObject(input, ["accountId", "quoteRef", "operation"], "wallet_first_commerce_service_invalid");
  return Object.freeze({
    accountId: normalizeAccountId(value.accountId, "wallet_first_commerce_service_invalid"),
    quoteRef: normalizeReference(value.quoteRef, "wallet_first_commerce_service_invalid"),
    operation: normalizeOperation(value.operation, "wallet_first_commerce_service_invalid")
  });
}

function normalizeTransitionRequest(input, { operation = false } = {}) {
  const fields = operation
    ? ["accountId", "transitionRef", "operation"]
    : ["accountId", "transitionRef"];
  const value = snapshotExactObject(input, fields, "wallet_first_commerce_service_invalid");
  return Object.freeze({
    accountId: normalizeAccountId(value.accountId, "wallet_first_commerce_service_invalid"),
    transitionRef: normalizeReference(value.transitionRef, "wallet_first_commerce_service_invalid"),
    ...(operation
      ? { operation: normalizeOperation(value.operation, "wallet_first_commerce_service_invalid") }
      : {})
  });
}

/**
 * Resolves the commercial model only from the authenticated account's server
 * record. Missing model is the legacy compatibility case. Any malformed or
 * unknown explicit model fails closed rather than falling back to legacy.
 */
export function resolveWalletFirstCommerceMode(input) {
  const code = "wallet_first_commerce_mode_unavailable";
  const values = snapshotExactObject(input, ["controlStore", "accountId"], code);
  const accountId = normalizeAccountId(values.accountId, code);
  const getAccount = ownCallable(values.controlStore, "getAccount", code);
  let record;
  try {
    record = getAccount.call(values.controlStore, accountId);
  } catch {
    throw serviceError(code);
  }
  const account = snapshotExactObject(record, ACCOUNT_FIELDS, code);
  if (
    account.id !== accountId
    || account.status !== "active"
  ) {
    throw serviceError(code);
  }
  const commercialModel = snapshotMetadataCommercialModel(account.metadata, code);
  if (commercialModel === null) return PORTAL_COMMERCE_MODE_LEGACY;
  if (commercialModel === WALLET_FIRST_COMMERCIAL_MODEL) {
    return PORTAL_COMMERCE_MODE_WALLET_FIRST;
  }
  throw serviceError(code);
}

/**
 * Defensive snapshot for the dedicated deferred surface. This contract is
 * intentionally distinct from coin-commerce-store: it has no confirmOrder or
 * ordinary platform_coin_holds method, preventing an accidental fallback to
 * the legacy capture lifecycle.
 */
export function snapshotWalletFirstCommerceService(value) {
  const code = "wallet_first_commerce_service_unavailable";
  if (!SERVICE_INSTANCES.has(value)) {
    throw serviceError(code);
  }
  const methods = {};
  for (const methodName of WALLET_FIRST_COMMERCE_SERVICE_METHODS) {
    const callable = ownCallable(value, methodName, code);
    methods[methodName] = (...args) => callable.call(value, ...args);
  }
  return Object.freeze(methods);
}

/**
 * Lightweight composition seam for a future real deferred checkout/reservation
 * implementation. The public methods accept no flow, priority, reservation
 * snapshot, or entitlement chain fields. Preview derives a sealed context
 * from the server-side chain resolver; reserve then consumes that immutable
 * context from the stored quote rather than recomputing time-sensitive input.
 */
export function createWalletFirstCommerceService(options = {}) {
  const values = snapshotExactObject(options, [
    "deferredSurface",
    "resourceChainResolver",
    "nowFn"
  ], "wallet_first_commerce_service_invalid");
  if (typeof values.nowFn !== "function") {
    throw serviceError("wallet_first_commerce_service_invalid");
  }
  const surface = (() => {
    const code = "wallet_first_commerce_service_invalid";
    const methods = {};
    for (const methodName of WALLET_FIRST_COMMERCE_SERVICE_METHODS) {
      const callable = ownCallable(values.deferredSurface, methodName, code);
      methods[methodName] = (...args) => callable.call(values.deferredSurface, ...args);
    }
    return Object.freeze(methods);
  })();
  const resourceChainResolver = snapshotResourceChainResolver(
    values.resourceChainResolver
  );
  const service = Object.freeze({
    listOffers: (input) => surface.listOffers(normalizeListOffersRequest(input)),
    getOffer: (input) => surface.getOffer(normalizeOfferRequest(input)),
    previewDeferredCheckout: (input) => {
      const request = normalizeOfferRequest(input);
      assertNoDeferredReconciliationRequired(surface, request.accountId);
      const transitionContext = deriveTransitionContext({
        accountId: request.accountId,
        resourceChainResolver,
        nowFn: values.nowFn
      });
      const checkout = surface.previewDeferredCheckout(Object.freeze({
        ...request,
        transitionContext
      }));
      return assertResultTransitionContext(checkout, transitionContext, {
        checkout: true
      });
    },
    reserveDeferredTransition: (input) => {
      const request = normalizeReserveRequest(input);
      assertNoDeferredReconciliationRequired(surface, request.accountId);
      const transition = surface.reserveDeferredTransition(Object.freeze({
        ...request
      }));
      return assertResultTransitionContext(transition, null);
    },
    listDeferredTransitions: (input) => projectPublicDeferredTransitionList(
      surface.listDeferredTransitions(normalizeListOffersRequest(input)),
      "wallet_first_commerce_service_unavailable"
    ),
    getDeferredTransition: (input) => projectPublicDeferredTransition(
      surface.getDeferredTransition(normalizeTransitionRequest(input)),
      "wallet_first_commerce_service_unavailable"
    ),
    cancelDeferredTransition: (input) => projectPublicDeferredTransition(
      surface.cancelDeferredTransition(
        normalizeTransitionRequest(input, { operation: true })
      ),
      "wallet_first_commerce_service_unavailable"
    )
  });
  SERVICE_INSTANCES.add(service);
  return service;
}
