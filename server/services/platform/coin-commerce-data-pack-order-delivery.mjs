import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";
import { coinCommerceDataPackRuntimeMarker } from "./coin-commerce-data-pack-runtime-issuer.mjs";

const REF = /^[a-z][a-z0-9_]{2,95}$/;

function unavailable() {
  const error = new Error("Data-pack order delivery is unavailable");
  error.code = "coin_commerce_data_pack_delivery_unavailable";
  return error;
}

function request(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== 2) throw unavailable();
  const snapshot = {};
  for (const field of ["accountId", "orderRef"]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")
      || typeof descriptor.value !== "string" || !REF.test(descriptor.value)) throw unavailable();
    snapshot[field] = descriptor.value;
  }
  return snapshot;
}

function runtimeRef(prefix, id) {
  return `${prefix}ref_${createHash("sha256").update(id).digest("hex").slice(0, 16)}`;
}

// Internal resolver: the caller must supply the authenticated session account
// and set no-store on the eventual HTTP response. Commerce's exact delivered
// receipt and the control effect are both required before decrypting material.
export function createCoinCommerceDataPackOrderDelivery({
  commerceStore, controlStore, runtimeCore, materialEscrow, nowFn = () => new Date()
} = {}) {
  if (!commerceStore?.getDeliveredOrderBinding || !controlStore?.readDataPackResourceUsage
    || !controlStore?.listIssuedSubscriptionBindings || !controlStore?.getIssuanceRequest
    || !runtimeCore?.listTenants || !runtimeCore?.listSubscriptionArtifacts
    || !materialEscrow?.release || typeof nowFn !== "function") throw unavailable();

  function get(input) {
    const { accountId, orderRef } = request(input);
    try {
      const order = commerceStore.getDeliveredOrderBinding({ accountId, orderRef });
      if (!order || order.kind !== "data_pack" || order.orderRef !== orderRef
        || !REF.test(order.requestRef) || !REF.test(order.entitlementRef)
        || !REF.test(order.offerVersionRef)) throw unavailable();
      const now = new Date(nowFn()).toISOString();
      const resource = controlStore.readDataPackResourceUsage({
        accountId, orderRef, requestRef: order.requestRef,
        entitlementRef: order.entitlementRef, now
      });
      const issuance = controlStore.getIssuanceRequest(order.requestRef);
      const metadata = issuance?.metadata;
      if (metadata?.kind !== "data_pack" || metadata.orderRef !== orderRef
        || metadata.offerVersionRef !== order.offerVersionRef
        || !REF.test(metadata.commandRef)) throw unavailable();
      const bindings = controlStore.listIssuedSubscriptionBindings({ accountId })
        .filter((binding) => binding.requestId === order.requestRef);
      if (bindings.length !== 1 || bindings[0].entitlementId !== order.entitlementRef) throw unavailable();
      const binding = bindings[0];
      const tenants = runtimeCore.listTenants().filter(
        (tenant) => tenant.note === coinCommerceDataPackRuntimeMarker(orderRef)
      );
      if (tenants.length !== 1) throw unavailable();
      const tenant = tenants[0];
      if (runtimeRef("tenant", tenant.id) !== binding.tenantRef
        || (tenant.nodeName ?? tenant.nodeId) !== binding.nodeId
        || !["active", "disabled"].includes(tenant.status)) throw unavailable();
      const artifacts = runtimeCore.listSubscriptionArtifacts(tenant.id)
        .filter((artifact) => artifact.status === "active"
          && artifact.tenantId === tenant.id
          && runtimeRef("artifact", artifact.id) === binding.artifactRef);
      if (artifacts.length !== 1) throw unavailable();
      const released = materialEscrow.release({
        orderRef, commandRef: metadata.commandRef,
        tenantId: tenant.id, artifactId: artifacts[0].id
      });
      if (typeof released?.subscriptionUrl !== "string") throw unavailable();
      return Object.freeze({ orderRef, subscriptionUrl: released.subscriptionUrl,
        usage: resource.usage });
    } catch {
      // The response must not reveal whether an order, account, runtime
      // identity, or protected artifact was missing.
      throw unavailable();
    }
  }

  return Object.freeze({ get });
}
