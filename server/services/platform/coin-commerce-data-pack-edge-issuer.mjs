import { types as utilTypes } from "node:util";

const INPUT_FIELDS = ["commandRef", "orderRef", "accountId", "requestRef", "entitlementRef"];
const REF = /^[a-z][a-z0-9_]{2,95}$/;
const GIB = 1024 ** 3;

function fail() {
  const error = new Error("Data-pack edge issuance requires reconciliation");
  error.code = "coin_commerce_data_pack_reconciliation_required";
  return error;
}

function exactData(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== fields.length) throw fail();
  const copy = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw fail();
    copy[field] = descriptor.value;
  }
  return copy;
}

// Source-only bridge between captured Commerce, protected edge material and
// an explicit control-store identity. Runtime desired state is intentionally
// separate and must converge before the order can be marked delivered.
export function createCoinCommerceDataPackEdgeIssuer({
  commerceStore, controlStore, materialStore, credentialIssuer,
  nowFn = () => new Date()
} = {}) {
  if (typeof commerceStore?.verifyCapturedFulfillmentClaim !== "function"
    || typeof controlStore?.getIssuanceRequest !== "function"
    || typeof controlStore?.getIssuedLink !== "function"
    || typeof controlStore?.registerCoinCommerceDataPackEdgeCredential !== "function"
    || typeof materialStore?.getCredentialMaterialSummary !== "function"
    || typeof credentialIssuer?.ensureCredentialForOrder !== "function"
    || typeof nowFn !== "function") throw fail();

  function issue(input, leaseInput) {
    const refs = exactData(input, INPUT_FIELDS);
    if (!Object.values(refs).every((value) => typeof value === "string" && REF.test(value))) {
      throw fail();
    }
    const lease = exactData(leaseInput, ["leaseGeneration", "leaseToken"]);
    if (!Number.isSafeInteger(lease.leaseGeneration) || lease.leaseGeneration < 1
      || typeof lease.leaseToken !== "string"
      || !/^[0-9a-f]{64}$/.test(lease.leaseToken)) throw fail();
    const verifyCapture = () => {
      const claim = commerceStore.verifyCapturedFulfillmentClaim({
        commandRef: refs.commandRef, orderRef: refs.orderRef,
        accountId: refs.accountId, ...lease
      });
      if (claim?.commandRef !== refs.commandRef || claim?.orderRef !== refs.orderRef
        || claim?.accountId !== refs.accountId || claim?.delivery?.kind !== "data_pack"
        || claim.delivery.neverExpires !== true
        || !Number.isSafeInteger(claim.delivery.trafficGb)) throw fail();
      return claim;
    };
    const claim = verifyCapture();
    const request = controlStore.getIssuanceRequest(refs.requestRef);
    const link = controlStore.getIssuedLink(`${refs.requestRef}_link_1`);
    if (!request || !link || request.id !== refs.requestRef
      || request.accountId !== refs.accountId
      || request.entitlementId !== refs.entitlementRef
      || request.status !== "issued"
      || request.purpose !== "coin_commerce_data_pack_fulfillment"
      || request.metadata?.commandRef !== refs.commandRef
      || request.metadata?.orderRef !== refs.orderRef
      || request.metadata?.offerVersionRef !== claim.offerVersionRef
      || request.metadata?.quotaBytes !== claim.delivery.trafficGb * GIB
      || request.metadata?.nodeId !== request.nodeId
      || link.requestId !== refs.requestRef || link.status !== "active") throw fail();
    const credential = credentialIssuer.ensureCredentialForOrder({ id: refs.requestRef });
    const summary = credential?.edgeCredentialRef
      ? materialStore.getCredentialMaterialSummary(credential.edgeCredentialRef) : null;
    if (credential?.edgeChannelRef !== request.nodeId
      || !summary || summary.credentialRef !== credential.edgeCredentialRef
      || summary.materialDigest !== credential.edgeMaterialDigest
      || !/^sha256:[a-f0-9]{64}$/.test(summary.materialDigest)) throw fail();
    verifyCapture();
    const now = new Date(nowFn()).toISOString();
    return controlStore.registerCoinCommerceDataPackEdgeCredential({
      requestRef: refs.requestRef, entitlementRef: refs.entitlementRef,
      edgeChannelRef: request.nodeId, edgeCredentialRef: summary.credentialRef,
      edgeMaterialDigest: summary.materialDigest, now
    });
  }

  return Object.freeze({ issue });
}
