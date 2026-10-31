import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import { types as utilTypes } from "node:util";
import Database from "better-sqlite3";

import {
  inspectWalletFirstDeferredCheckoutSchema
} from "./wallet-first-deferred-checkout-migrations.mjs";
import {
  WALLET_FIRST_DEFERRED_CHECKOUT_QUOTE_TTL_MS,
  createWalletFirstDeferredCheckoutQuoteInTransaction,
  getWalletFirstDeferredCheckoutOfferInTransaction,
  listWalletFirstDeferredCheckoutOffersInTransaction,
  normalizeWalletFirstDeferredTransitionContext
} from "./wallet-first-deferred-checkout-quote-contract.mjs";

export const WALLET_FIRST_DEFERRED_CHECKOUT_ADAPTER_CONTRACT =
  "wallet-first-deferred-checkout-adapter/v1";
export const WALLET_FIRST_DEFERRED_CHECKOUT_SURFACE_METHODS = Object.freeze([
  "listOffers",
  "getOffer",
  "previewDeferredCheckout",
  "reserveDeferredTransition",
  "listDeferredTransitions",
  "getDeferredTransition",
  "cancelDeferredTransition"
]);

const FACTORY_FIELDS = new Set([
  "dbPath",
  "database",
  "deferredTransitionStore",
  "nowFn",
  "refFactory",
  "quoteTtlMs"
]);
const REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const REQUIRED_STORE_METHODS = Object.freeze([
  "reserveTransitionFromCheckoutQuote",
  "listTransitions",
  "getTransition",
  "cancelTransition"
]);
const ADAPTER_METHODS = Object.freeze([
  ...WALLET_FIRST_DEFERRED_CHECKOUT_SURFACE_METHODS,
  "close"
]);
const ADAPTER_INSTANCES = new WeakSet();

function adapterError(code) {
  const error = new Error("Wallet-first deferred checkout adapter is unavailable");
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

function exactOptions(options) {
  if (!isPlainObject(options)) throw adapterError("wallet_first_deferred_checkout_invalid");
  const output = {};
  for (const key of Reflect.ownKeys(options)) {
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (
      typeof key !== "string"
      || !FACTORY_FIELDS.has(key)
      || !descriptor
      || !descriptor.enumerable
      || !("value" in descriptor)
    ) {
      throw adapterError("wallet_first_deferred_checkout_invalid");
    }
    output[key] = descriptor.value;
  }
  if (!Object.hasOwn(output, "deferredTransitionStore") || !Object.hasOwn(output, "nowFn")) {
    throw adapterError("wallet_first_deferred_checkout_invalid");
  }
  if (Object.hasOwn(output, "database") === Object.hasOwn(output, "dbPath")) {
    throw adapterError("wallet_first_deferred_checkout_invalid");
  }
  return output;
}

function snapshotStore(value) {
  if (!value || (typeof value !== "object" && typeof value !== "function") || utilTypes.isProxy(value)) {
    throw adapterError("wallet_first_deferred_checkout_invalid");
  }
  const store = {};
  for (const methodName of REQUIRED_STORE_METHODS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, methodName);
    if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "function") {
      throw adapterError("wallet_first_deferred_checkout_invalid");
    }
    store[methodName] = (...args) => descriptor.value.call(value, ...args);
  }
  return Object.freeze(store);
}

function normalizeNow(nowFn) {
  let value;
  try {
    value = nowFn();
  } catch {
    throw adapterError("wallet_first_deferred_checkout_unavailable");
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw adapterError("wallet_first_deferred_checkout_unavailable");
  }
  return value.toISOString();
}

function defaultReference(prefix) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function nextReference(refFactory, prefix) {
  let value;
  try {
    value = refFactory(prefix);
  } catch {
    throw adapterError("wallet_first_deferred_checkout_unavailable");
  }
  if (typeof value !== "string" || !REFERENCE.test(value)) {
    throw adapterError("wallet_first_deferred_checkout_unavailable");
  }
  return value;
}

function normalizeAdapterError(error) {
  const code = error?.code;
  if (
    [
      "offer_unavailable",
      "quote_expired",
      "quote_stale",
      "unsupported_deferred_transition_offer",
      "deferred_transition_not_found",
      "deferred_transition_account_conflict",
      "deferred_transition_account_not_eligible",
      "deferred_transition_expected_chain_invalid",
      "deferred_transition_idempotency_conflict",
      "deferred_transition_queue_full",
      "deferred_transition_state_conflict",
      "deferred_transition_invalid_input",
      "deferred_reservation_invalid",
      "deferred_reservation_capture_invalid",
      "bonus_expires_before_activation",
      "reconciliation_required",
      "insufficient_coins",
      "wallet_not_active",
      "wallet_first_deferred_checkout_invalid",
      "wallet_first_deferred_checkout_unavailable"
    ].includes(code)
  ) {
    return error;
  }
  return adapterError("wallet_first_deferred_checkout_unavailable");
}

function accountIdFrom(input) {
  if (!isPlainObject(input)) throw adapterError("wallet_first_deferred_checkout_invalid");
  const descriptor = Object.getOwnPropertyDescriptor(input, "accountId");
  if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || !REFERENCE.test(descriptor.value)) {
    throw adapterError("wallet_first_deferred_checkout_invalid");
  }
  return descriptor.value;
}

// Peels the optional client-supplied `adsClick` descriptor off a request
// object before an exact-field contract runs. Any non-data or unexpected
// property shape leaves the input untouched, so the exact-field contract
// rejects it exactly as it would have before this descriptor existed.
function splitOptionalAdsClick(input) {
  if (!isPlainObject(input)) return { request: input, adsClick: undefined };
  const descriptor = Object.getOwnPropertyDescriptor(input, "adsClick");
  if (!descriptor) return { request: input, adsClick: undefined };
  if (!descriptor.enumerable || !("value" in descriptor)) {
    return { request: input, adsClick: undefined };
  }
  const request = {};
  for (const key of Reflect.ownKeys(input)) {
    if (key === "adsClick") continue;
    const field = Object.getOwnPropertyDescriptor(input, key);
    if (!field || !field.enumerable || !("value" in field)) {
      return { request: input, adsClick: undefined };
    }
    request[key] = field.value;
  }
  return { request, adsClick: descriptor.value };
}

function exactRequest(input, fields) {
  if (!isPlainObject(input)) throw adapterError("wallet_first_deferred_checkout_invalid");
  const keys = Reflect.ownKeys(input);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key))) {
    throw adapterError("wallet_first_deferred_checkout_invalid");
  }
  const result = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw adapterError("wallet_first_deferred_checkout_invalid");
    }
    result[field] = descriptor.value;
  }
  return result;
}

/**
 * Returns an invocation-bound view of a factory-created adapter. The private
 * WeakSet makes the capability unforgeable across module consumers: a public
 * contract string and matching method names alone are insufficient to become
 * the wallet-first checkout surface.
 */
export function snapshotWalletFirstDeferredCheckoutAdapter(adapter) {
  if (
    !adapter
    || (typeof adapter !== "object" && typeof adapter !== "function")
    || utilTypes.isProxy(adapter)
    || !ADAPTER_INSTANCES.has(adapter)
  ) {
    throw adapterError("wallet_first_deferred_checkout_invalid");
  }
  const contract = Object.getOwnPropertyDescriptor(adapter, "contract");
  if (
    !contract
    || !contract.enumerable
    || !("value" in contract)
    || contract.value !== WALLET_FIRST_DEFERRED_CHECKOUT_ADAPTER_CONTRACT
  ) {
    throw adapterError("wallet_first_deferred_checkout_invalid");
  }
  const snapshot = {
    contract: WALLET_FIRST_DEFERRED_CHECKOUT_ADAPTER_CONTRACT
  };
  for (const methodName of ADAPTER_METHODS) {
    const descriptor = Object.getOwnPropertyDescriptor(adapter, methodName);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || typeof descriptor.value !== "function") {
      throw adapterError("wallet_first_deferred_checkout_invalid");
    }
    snapshot[methodName] = (...args) => descriptor.value.call(adapter, ...args);
  }
  return Object.freeze(snapshot);
}

/**
 * The only concrete deferredSurface for future wallet-first accounts. It does
 * not import or expose ordinary coin-commerce quote/order methods; a quote is
 * just immutable provenance until the deferred store atomically converts it to
 * a dedicated reservation through its own participant.
 */
export function createWalletFirstDeferredCheckoutAdapter(options = {}) {
  const values = exactOptions(options);
  if (typeof values.nowFn !== "function") {
    throw adapterError("wallet_first_deferred_checkout_invalid");
  }
  const quoteTtlMs = values.quoteTtlMs ?? WALLET_FIRST_DEFERRED_CHECKOUT_QUOTE_TTL_MS;
  if (!Number.isSafeInteger(quoteTtlMs) || quoteTtlMs < 1 || quoteTtlMs > 3_600_000) {
    throw adapterError("wallet_first_deferred_checkout_invalid");
  }
  const refFactory = values.refFactory ?? defaultReference;
  if (typeof refFactory !== "function") throw adapterError("wallet_first_deferred_checkout_invalid");
  const store = snapshotStore(values.deferredTransitionStore);
  let database = values.database ?? null;
  let owned = false;
  try {
    if (!database) {
      if (typeof values.dbPath !== "string" || !isAbsolute(values.dbPath)) {
        throw adapterError("wallet_first_deferred_checkout_invalid");
      }
      database = new Database(values.dbPath, { fileMustExist: true });
      owned = true;
    }
    if (
      typeof database.prepare !== "function"
      || typeof database.transaction !== "function"
      || typeof database.pragma !== "function"
    ) {
      throw adapterError("wallet_first_deferred_checkout_invalid");
    }
    database.pragma("foreign_keys = ON");
    if (!inspectWalletFirstDeferredCheckoutSchema({ database }).ok) {
      throw adapterError("wallet_first_deferred_checkout_unavailable");
    }
  } catch (error) {
    if (owned) {
      try {
        database?.close();
      } catch {
        // The construction error is the useful failure.
      }
    }
    if (error?.code === "wallet_first_deferred_checkout_invalid") throw error;
    throw adapterError("wallet_first_deferred_checkout_unavailable");
  }

  let closed = false;
  const assertOpen = () => {
    if (closed) throw adapterError("wallet_first_deferred_checkout_unavailable");
  };
  const createQuoteTransaction = database.transaction((request) => {
    const occurredAt = normalizeNow(values.nowFn);
    return createWalletFirstDeferredCheckoutQuoteInTransaction({
      database,
      accountId: request.accountId,
      offerRef: request.offerRef,
      transitionContext: request.transitionContext,
      quoteRef: nextReference(refFactory, "deferred_quote"),
      deferredOrderRef: nextReference(refFactory, "deferred_order"),
      occurredAt,
      quoteTtlMs
    });
  });

  const adapter = Object.freeze({
    contract: WALLET_FIRST_DEFERRED_CHECKOUT_ADAPTER_CONTRACT,
    listOffers(input) {
      assertOpen();
      try {
        const { accountId } = exactRequest(input, ["accountId"]);
        return database.transaction(() => listWalletFirstDeferredCheckoutOffersInTransaction({
          database,
          accountId
        })).immediate();
      } catch (error) {
        throw normalizeAdapterError(error);
      }
    },
    getOffer(input) {
      assertOpen();
      try {
        const request = exactRequest(input, ["accountId", "offerRef"]);
        if (!REFERENCE.test(request.offerRef)) throw adapterError("wallet_first_deferred_checkout_invalid");
        return database.transaction(() => getWalletFirstDeferredCheckoutOfferInTransaction({
          database,
          accountId: accountIdFrom(request),
          offerRef: request.offerRef
        })).immediate();
      } catch (error) {
        throw normalizeAdapterError(error);
      }
    },
    previewDeferredCheckout(input) {
      assertOpen();
      try {
        const request = exactRequest(input, ["accountId", "offerRef", "transitionContext"]);
        if (!REFERENCE.test(request.offerRef)) throw adapterError("wallet_first_deferred_checkout_invalid");
        return createQuoteTransaction.immediate({
          accountId: accountIdFrom(request),
          offerRef: request.offerRef,
          transitionContext: normalizeWalletFirstDeferredTransitionContext(request.transitionContext)
        });
      } catch (error) {
        throw normalizeAdapterError(error);
      }
    },
    reserveDeferredTransition(input) {
      assertOpen();
      try {
        const { request: peeled, adsClick } = splitOptionalAdsClick(input);
        const request = exactRequest(peeled, ["accountId", "quoteRef", "operation"]);
        if (!REFERENCE.test(request.quoteRef)) throw adapterError("wallet_first_deferred_checkout_invalid");
        return store.reserveTransitionFromCheckoutQuote({
          accountId: accountIdFrom(request),
          quoteRef: request.quoteRef,
          operation: request.operation,
          ...(adsClick !== undefined ? { adsClick } : {})
        });
      } catch (error) {
        throw normalizeAdapterError(error);
      }
    },
    listDeferredTransitions(input) {
      assertOpen();
      try {
        return store.listTransitions(exactRequest(input, ["accountId"]));
      } catch (error) {
        throw normalizeAdapterError(error);
      }
    },
    getDeferredTransition(input) {
      assertOpen();
      try {
        const request = exactRequest(input, ["accountId", "transitionRef"]);
        if (!REFERENCE.test(request.transitionRef)) throw adapterError("wallet_first_deferred_checkout_invalid");
        return store.getTransition({
          accountId: accountIdFrom(request),
          transitionRef: request.transitionRef
        });
      } catch (error) {
        throw normalizeAdapterError(error);
      }
    },
    cancelDeferredTransition(input) {
      assertOpen();
      try {
        const request = exactRequest(input, ["accountId", "transitionRef", "operation"]);
        if (!REFERENCE.test(request.transitionRef)) throw adapterError("wallet_first_deferred_checkout_invalid");
        return store.cancelTransition({
          accountId: accountIdFrom(request),
          transitionRef: request.transitionRef,
          operation: request.operation
        });
      } catch (error) {
        throw normalizeAdapterError(error);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      if (owned) database.close();
    }
  });
  ADAPTER_INSTANCES.add(adapter);
  return adapter;
}

