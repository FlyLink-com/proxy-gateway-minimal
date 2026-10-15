import { types as utilTypes } from "node:util";

import { createCoinCommerceFulfillmentReconciliationError } from "./coin-commerce-fulfillment-retry.mjs";
import { createCoinCommerceDataPackRuntimeIssuer } from "./coin-commerce-data-pack-runtime-issuer.mjs";
import { createCoinCommerceDataPackEdgeIssuer } from "./coin-commerce-data-pack-edge-issuer.mjs";
import { createCoinCommerceDataPackFulfillmentHandler } from "./coin-commerce-data-pack-fulfillment.mjs";

function validHandler(handler) {
  if (!handler || typeof handler !== "object" || Array.isArray(handler)
    || utilTypes.isProxy(handler) || Object.getPrototypeOf(handler) !== Object.prototype
    || Reflect.ownKeys(handler).length !== 2) return false;
  const contract = Object.getOwnPropertyDescriptor(handler, "idempotencyContract");
  const execute = Object.getOwnPropertyDescriptor(handler, "execute");
  return contract?.enumerable && contract.value === "deduplicate_by_command_ref"
    && execute?.enumerable && typeof execute.value === "function";
}

export function composeCoinCommerceDataPackFulfillment({ planHandler, dataPackHandler } = {}) {
  if (!validHandler(planHandler) || !validHandler(dataPackHandler)) {
    throw createCoinCommerceFulfillmentReconciliationError();
  }
  return Object.freeze({
    idempotencyContract: "deduplicate_by_command_ref",
    async execute(command) {
      if (!command || typeof command !== "object" || utilTypes.isProxy(command)) {
        throw createCoinCommerceFulfillmentReconciliationError();
      }
      const descriptor = Object.getOwnPropertyDescriptor(command, "delivery");
      const delivery = descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : null;
      if (!delivery || typeof delivery !== "object" || utilTypes.isProxy(delivery)) {
        throw createCoinCommerceFulfillmentReconciliationError();
      }
      const kind = Object.getOwnPropertyDescriptor(delivery, "kind");
      if (!kind || !Object.hasOwn(kind, "value")) {
        throw createCoinCommerceFulfillmentReconciliationError();
      }
      if (kind.value === "data_pack") return dataPackHandler.execute(command);
      if (kind.value === "subscription_plan") return planHandler.execute(command);
      throw createCoinCommerceFulfillmentReconciliationError();
    }
  });
}

/** Explicit, opt-in composition after the Commerce store exists. No catalog publication. */
export function createCoinCommerceDataPackProductionFulfillment({
  commerceStore, controlStore, runtimeCore, materialEscrow, nodeId,
  edgeMaterialStore, edgeCredentialIssuer, desiredStateNotifier,
  nowFn = () => new Date()
} = {}) {
  const runtimeIssuer = createCoinCommerceDataPackRuntimeIssuer({
    commerceStore, controlStore, runtimeCore, materialEscrow, nodeId, nowFn
  });
  const edgeIssuer = createCoinCommerceDataPackEdgeIssuer({
    commerceStore, controlStore, materialStore: edgeMaterialStore,
    credentialIssuer: edgeCredentialIssuer, nowFn
  });
  return createCoinCommerceDataPackFulfillmentHandler({
    commerceStore, controlStore, runtimeIssuer, edgeIssuer, desiredStateNotifier
  });
}
