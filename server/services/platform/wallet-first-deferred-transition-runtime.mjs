import { types as utilTypes } from "node:util";

import {
  createDeferredResourceTransitionCoordinator
} from "./deferred-resource-transition-coordinator.mjs";
import {
  createSqliteDeferredResourceTransitionStore
} from "./deferred-resource-transition-store.mjs";
import {
  createWalletFirstDeferredCheckoutAdapter,
  snapshotWalletFirstDeferredCheckoutAdapter
} from "./wallet-first-deferred-checkout-adapter.mjs";
import {
  createWalletFirstResourceEffectAdapters
} from "./wallet-first-resource-effect-adapter.mjs";
import {
  createWalletFirstCommerceService
} from "./wallet-first-commerce-service.mjs";
import {
  createWalletFirstResourceEffectHandler
} from "./wallet-first-resource-effect-handler.mjs";

const OPTION_FIELDS = Object.freeze([
  "dbPath",
  "controlStore",
  "subscriptionCore",
  "nodeId",
  "nowFn"
]);

function runtimeError(code) {
  const error = new Error("Wallet-first deferred transition runtime is unavailable");
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
    if (!isPlainObject(value)) throw runtimeError(code);
    const expected = new Set(fields);
    const result = {};
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length) throw runtimeError(code);
    for (const key of keys) {
      if (typeof key !== "string" || !expected.has(key)) throw runtimeError(code);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw runtimeError(code);
      }
      result[key] = descriptor.value;
    }
    for (const field of fields) {
      if (!Object.hasOwn(result, field)) throw runtimeError(code);
    }
    return result;
  } catch (error) {
    if (error?.code === code) throw error;
    throw runtimeError(code);
  }
}

function closeQuietly(value) {
  try {
    value?.close();
  } catch {
    // The original construction error is the useful state-gate failure.
  }
}

/**
 * Wires the one deferred store to the one factory-created checkout adapter,
 * resource-effect bridge, coordinator, and Portal service. The runtime owns
 * all non-Portal capabilities: it does not accept a caller-supplied checkout
 * surface, generic resource adapter, or ordinary Commerce binding. The
 * checkout adapter is immediately snapshot through its module-private WeakSet
 * gate, while the effect handler snapshots separately branded control/runtime
 * adapters before it can use them.
 */
export function createWalletFirstDeferredTransitionRuntime(options = {}) {
  const values = exactObject(
    options,
    OPTION_FIELDS,
    "wallet_first_deferred_runtime_invalid"
  );
  if (
    typeof values.dbPath !== "string"
    || values.dbPath.trim() !== values.dbPath
    || values.dbPath.length === 0
    || typeof values.nodeId !== "string"
    || values.nodeId.trim() !== values.nodeId
    || values.nodeId.length === 0
    || typeof values.nowFn !== "function"
  ) {
    throw runtimeError("wallet_first_deferred_runtime_invalid");
  }

  let deferredTransitionStore;
  try {
    deferredTransitionStore = createSqliteDeferredResourceTransitionStore({
      dbPath: values.dbPath,
      nowFn: values.nowFn
    });
  } catch {
    throw runtimeError("wallet_first_deferred_runtime_unavailable");
  }

  let deferredCheckoutAdapter;
  try {
    const checkoutAdapter = createWalletFirstDeferredCheckoutAdapter({
      dbPath: values.dbPath,
      deferredTransitionStore,
      nowFn: values.nowFn
    });
    deferredCheckoutAdapter = snapshotWalletFirstDeferredCheckoutAdapter(
      checkoutAdapter
    );
    const resourceAdapters = createWalletFirstResourceEffectAdapters({
      controlStore: values.controlStore,
      subscriptionCore: values.subscriptionCore,
      nodeId: values.nodeId,
      nowFn: values.nowFn
    });
    const resourceEffectHandler = createWalletFirstResourceEffectHandler({
      controlAdapter: resourceAdapters.controlAdapter,
      runtimeAdapter: resourceAdapters.runtimeAdapter
    });
    const walletFirstCommerceService = createWalletFirstCommerceService({
      deferredSurface: deferredCheckoutAdapter,
      resourceChainResolver: resourceEffectHandler,
      nowFn: values.nowFn
    });
    const deferredTransitionCoordinator = createDeferredResourceTransitionCoordinator({
      store: deferredTransitionStore,
      resourceEffectHandler,
      nowFn: values.nowFn
    });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      let firstError;
      try {
        deferredCheckoutAdapter.close();
      } catch (error) {
        firstError ||= error;
      }
      try {
        deferredTransitionStore.close();
      } catch (error) {
        firstError ||= error;
      }
      if (firstError) throw firstError;
    };
    return Object.freeze({
      deferredTransitionStore,
      resourceEffectHandler,
      deferredTransitionCoordinator,
      walletFirstCommerceService,
      close
    });
  } catch (error) {
    closeQuietly(deferredCheckoutAdapter);
    closeQuietly(deferredTransitionStore);
    if (
      error?.code === "wallet_first_deferred_runtime_invalid"
      || error?.code === "wallet_first_deferred_runtime_unavailable"
    ) {
      throw error;
    }
    throw runtimeError("wallet_first_deferred_runtime_unavailable");
  }
}
