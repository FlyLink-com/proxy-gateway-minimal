import { types as utilTypes } from "node:util";
import { COIN_COMMERCE_DATA_PACK_CANDIDATES } from "./coin-commerce-production-catalog.mjs";
import {
  createCoinCommerceFulfillmentReconciliationError,
  createCoinCommerceFulfillmentRetryableError
} from "./coin-commerce-fulfillment-retry.mjs";

const GIB = 1024 ** 3;
const TECHNICAL_VALID_UNTIL = "9999-12-31T23:59:59.999Z";
const REF = /^[a-z][a-z0-9_]{2,95}$/;
const COMMAND_FIELDS = ["commandRef", "orderRef", "accountId", "offerVersionRef",
  "delivery", "fulfillmentLease"];
const DELIVERY_FIELDS = ["kind", "durationDays", "monthlyTrafficGb", "trafficGb",
  "neverExpires", "discountBasisPoints"];
const AUTHORITY_FIELDS = ["authorityRef", "authorityVersion", "resourceRequestId",
  "entitlementId", "issuedLinkId"];

function reconcile() {
  throw createCoinCommerceFulfillmentReconciliationError();
}

function retry() {
  throw createCoinCommerceFulfillmentRetryableError();
}

function exactData(input, fields) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || utilTypes.isProxy(input) || Object.getPrototypeOf(input) !== Object.prototype
    || Reflect.ownKeys(input).length !== fields.length) reconcile();
  const copy = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) reconcile();
    copy[field] = descriptor.value;
  }
  return copy;
}

function canonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function errorCode(error) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, "code");
    return descriptor && Object.hasOwn(descriptor, "value")
      && typeof descriptor.value === "string" ? descriptor.value : "";
  } catch {
    return "";
  }
}

function classify(error) {
  const code = errorCode(error);
  if (["reconciliation_required", "validation_error", "not_found",
    "coin_commerce_data_pack_reconciliation_required",
    "data_pack_edge_desired_state_reconciliation_required"].includes(code)) reconcile();
  retry();
}

// Source-only handler for the independent pack path. The published catalog
// still excludes these offers; production composition must supply the real
// Commerce store, issuers and notifier before enabling any purchase.
export function createCoinCommerceDataPackFulfillmentHandler({
  commerceStore, controlStore, runtimeIssuer, edgeIssuer,
  desiredStateNotifier
} = {}) {
  if (typeof commerceStore?.verifyCapturedFulfillmentClaim !== "function"
    || typeof controlStore?.getIssuanceRequest !== "function"
    || typeof controlStore?.applyCoinCommerceDataPackFulfillment !== "function"
    || typeof controlStore?.getLatestEdgeDesiredStateForChannel !== "function"
    || typeof controlStore?.listEdgeApplyReceipts !== "function"
    || typeof runtimeIssuer?.issue !== "function"
    || typeof edgeIssuer?.issue !== "function"
    || typeof desiredStateNotifier?.notifyOrderLifecycle !== "function") reconcile();

  function execute(input) {
    if (!input || typeof input !== "object" || utilTypes.isProxy(input)) reconcile();
    const fields = input && Object.hasOwn(input, "authority")
      ? [...COMMAND_FIELDS, "authority"] : COMMAND_FIELDS;
    const command = exactData(input, fields);
    const delivery = exactData(command.delivery, DELIVERY_FIELDS);
    const lease = exactData(command.fulfillmentLease, ["leaseGeneration", "leaseToken"]);
    if (Object.hasOwn(command, "authority")) {
      const authority = exactData(command.authority, AUTHORITY_FIELDS);
      if (!Number.isSafeInteger(authority.authorityVersion)
        || authority.authorityVersion < 1
        || ![authority.authorityRef, authority.resourceRequestId,
          authority.entitlementId, authority.issuedLinkId]
          .every((value) => typeof value === "string"
            && /^[A-Za-z0-9._:-]{1,128}$/.test(value))) reconcile();
      // A pre-existing timed-plan authority is not the pack's resource owner.
    }
    if (![command.commandRef, command.orderRef, command.accountId,
      command.offerVersionRef].every((value) => typeof value === "string" && REF.test(value))
      || !Number.isSafeInteger(lease.leaseGeneration) || lease.leaseGeneration < 1
      || typeof lease.leaseToken !== "string"
      || !/^[a-f0-9]{64}$/.test(lease.leaseToken)) reconcile();
    const offer = COIN_COMMERCE_DATA_PACK_CANDIDATES.find((candidate) => (
      candidate.offerVersionRef === command.offerVersionRef
      && DELIVERY_FIELDS.every((field) => candidate.delivery[field] === delivery[field])
    ));
    if (!offer || delivery.kind !== "data_pack" || delivery.neverExpires !== true) reconcile();
    const verifyClaim = () => {
      let claim;
      try {
        claim = commerceStore.verifyCapturedFulfillmentClaim({
          commandRef: command.commandRef, orderRef: command.orderRef,
          accountId: command.accountId, ...lease
        });
      } catch (error) {
        classify(error);
      }
      if (claim?.commandRef !== command.commandRef
        || claim?.orderRef !== command.orderRef
        || claim?.accountId !== command.accountId
        || claim?.offerVersionRef !== offer.offerVersionRef
        || !DELIVERY_FIELDS.every((field) => claim.delivery?.[field] === delivery[field])) {
        reconcile();
      }
    };
    verifyClaim();
    const quotaBytes = delivery.trafficGb * GIB;
    let issued;
    try {
      issued = runtimeIssuer.issue({
        commandRef: command.commandRef, orderRef: command.orderRef,
        accountId: command.accountId, offerVersionRef: offer.offerVersionRef,
        quotaBytes
      }, lease);
    } catch (error) { classify(error); }
    if (issued?.orderRef !== command.orderRef || issued?.status !== "issued"
      || typeof issued.requestRef !== "string"
      || typeof issued.entitlementRef !== "string"
      || issued.issuedLinkRef !== `${issued.requestRef}_link_1`) reconcile();
    let edge;
    try {
      edge = edgeIssuer.issue({
        commandRef: command.commandRef, orderRef: command.orderRef,
        accountId: command.accountId, requestRef: issued.requestRef,
        entitlementRef: issued.entitlementRef
      }, lease);
    } catch (error) { classify(error); }
    if (edge?.status !== "active" || edge.requestRef !== issued.requestRef
      || edge.entitlementRef !== issued.entitlementRef
      || typeof edge.edgeChannelRef !== "string"
      || typeof edge.edgeCredentialRef !== "string") reconcile();
    let request;
    try { request = controlStore.getIssuanceRequest(issued.requestRef); }
    catch (error) { classify(error); }
    if (request?.id !== issued.requestRef
      || request.accountId !== command.accountId
      || request.entitlementId !== issued.entitlementRef
      || request.status !== "issued"
      || request.purpose !== "coin_commerce_data_pack_fulfillment"
      || request.metadata?.commandRef !== command.commandRef
      || request.metadata?.orderRef !== command.orderRef
      || !canonicalTimestamp(request.createdAt)) reconcile();
    let effect;
    try {
      effect = controlStore.applyCoinCommerceDataPackFulfillment({
        orderRef: command.orderRef, commandRef: command.commandRef,
        accountId: command.accountId, requestRef: issued.requestRef,
        entitlementRef: issued.entitlementRef, issuedLinkRef: issued.issuedLinkRef,
        offerVersionRef: offer.offerVersionRef, quotaBytes,
        technicalValidUntil: TECHNICAL_VALID_UNTIL,
        commercialNeverExpires: true, createdAt: request.createdAt
      });
    } catch (error) { classify(error); }
    if (effect?.orderRef !== command.orderRef
      || effect.requestRef !== issued.requestRef
      || effect.entitlementRef !== issued.entitlementRef
      || effect.issuedLinkRef !== issued.issuedLinkRef
      || typeof effect.effectRef !== "string") reconcile();
    let notified;
    try {
      notified = desiredStateNotifier.notifyOrderLifecycle({
        reason: "coin_commerce_data_pack_fulfillment",
        order: { edgeChannelRef: edge.edgeChannelRef }
      });
    } catch (error) { classify(error); }
    const notifications = notified?.notifications;
    if (notified?.notificationCount !== 1 || !Array.isArray(notifications)
      || notifications.length !== 1
      || notifications[0]?.channelRef !== edge.edgeChannelRef
      || typeof notifications[0]?.nodeRef !== "string") reconcile();
    const notification = notifications[0];
    let desired;
    let receipts;
    try {
      desired = controlStore.getLatestEdgeDesiredStateForChannel(edge.edgeChannelRef, {
        nodeRef: notification.nodeRef
      });
      receipts = controlStore.listEdgeApplyReceipts({ channelRef: edge.edgeChannelRef });
    } catch (error) { classify(error); }
    if (desired?.desiredStateRef !== notification.desiredStateRef
      || desired?.generation !== notification.generation
      || !desired.edgeCredentialRefs?.includes(edge.edgeCredentialRef)
      || !desired.materialDigests?.some((item) => (
        item.edgeCredentialRef === edge.edgeCredentialRef
        && item.channelRef === edge.edgeChannelRef
        && /^sha256:[a-f0-9]{64}$/.test(item.digest)
      ))) reconcile();
    if (notification.status !== "applied" || !Array.isArray(receipts)
      || !receipts.some((receipt) => (
        receipt.channelRef === edge.edgeChannelRef
        && receipt.desiredStateRef === desired.desiredStateRef
        && receipt.status === "applied"
        && receipt.configTestOk === true
        && receipt.serviceActive === true
        && receipt.listenerUdp443 === true
        && typeof receipt.appliedAt === "string"
      ))) retry();
    verifyClaim();
    return Object.freeze({ status: "delivered", effectRef: effect.effectRef });
  }

  return Object.freeze({ idempotencyContract: "deduplicate_by_command_ref", execute });
}
