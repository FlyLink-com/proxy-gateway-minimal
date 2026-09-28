import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

const TECHNICAL_VALID_UNTIL = "9999-12-31T23:59:59.999Z";
const REF = /^[a-z][a-z0-9_]{2,95}$/;
const NODE_REF = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const COMMAND_FIELDS = ["commandRef", "orderRef", "accountId", "offerVersionRef", "quotaBytes"];
const GIB = 1024 ** 3;

function fail() {
  const error = new Error("Data-pack runtime issuance requires reconciliation");
  error.code = "coin_commerce_data_pack_reconciliation_required";
  return error;
}

function ref(value) {
  if (typeof value !== "string" || !REF.test(value)) throw fail();
  return value;
}

function exactCommand(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) throw fail();
  const fields = Reflect.ownKeys(value);
  if (fields.length !== COMMAND_FIELDS.length
    || !COMMAND_FIELDS.every((field) => fields.includes(field))) throw fail();
  const command = {};
  for (const field of COMMAND_FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw fail();
    command[field] = descriptor.value;
  }
  return command;
}

function exactLease(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== 2) throw fail();
  const generation = Object.getOwnPropertyDescriptor(value, "leaseGeneration");
  const token = Object.getOwnPropertyDescriptor(value, "leaseToken");
  if (!generation?.enumerable || !Object.hasOwn(generation, "value")
    || !Number.isSafeInteger(generation.value) || generation.value < 1
    || !token?.enumerable || !Object.hasOwn(token, "value")
    || typeof token.value !== "string" || !/^[0-9a-f]{64}$/.test(token.value)) throw fail();
  return { leaseGeneration: generation.value, leaseToken: token.value };
}

function runtimeRef(prefix, id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{3,128}$/.test(id)) throw fail();
  return `${prefix}ref_${createHash("sha256").update(id).digest("hex").slice(0, 16)}`;
}

export function coinCommerceDataPackRuntimeMarker(orderRef) {
  // Core rejects long hex strings in notes as potential secrets. This is a
  // non-secret lookup marker; collisions still fail closed on multiple hits.
  return `coin_data_pack_${createHash("sha256").update(ref(orderRef)).digest("hex").slice(0, 24)}`;
}

// Source-only runtime stage. The Commerce fulfillment handler must supply its
// exact live claim, which is checked against captured payment before writes;
// this is not a public purchase API. It
// does not create edge credentials, mark an order delivered or publish packs.
export function createCoinCommerceDataPackRuntimeIssuer({
  commerceStore, controlStore, runtimeCore, materialEscrow, nodeId,
  nowFn = () => new Date()
} = {}) {
  if (typeof commerceStore?.verifyCapturedFulfillmentClaim !== "function"
    || !controlStore?.reserveCoinCommerceDataPackIssuance
    || !controlStore?.completeCoinCommerceDataPackIssuance
    || !runtimeCore?.listTenants || !runtimeCore?.createTenant
    || !runtimeCore?.listSubscriptionArtifacts
    || !runtimeCore?.createSubscriptionArtifact
    || !materialEscrow?.capture || !materialEscrow?.verify
    || typeof nowFn !== "function") throw fail();
  if (typeof nodeId !== "string" || !NODE_REF.test(nodeId)) throw fail();

  function issue(input = {}, leaseInput) {
    const command = exactCommand(input);
    const lease = exactLease(leaseInput);
    const commandRef = ref(command.commandRef);
    const orderRef = ref(command.orderRef);
    const accountId = ref(command.accountId);
    const offerVersionRef = ref(command.offerVersionRef);
    const verifyCapture = () => {
      const claimed = commerceStore.verifyCapturedFulfillmentClaim({
        commandRef, orderRef, accountId, ...lease
      });
      if (claimed?.commandRef !== commandRef || claimed?.orderRef !== orderRef
        || claimed?.accountId !== accountId
        || claimed?.offerVersionRef !== offerVersionRef
        || claimed?.delivery?.kind !== "data_pack"
        || claimed.delivery.neverExpires !== true
        || !Number.isSafeInteger(claimed.delivery.trafficGb)
        || claimed.delivery.trafficGb * GIB !== command.quotaBytes) throw fail();
    };
    verifyCapture();
    const now = new Date(nowFn()).toISOString();
    if (now >= TECHNICAL_VALID_UNTIL) throw fail();
    const reservation = controlStore.reserveCoinCommerceDataPackIssuance({
      commandRef, orderRef, accountId, offerVersionRef,
      quotaBytes: command.quotaBytes, nodeId, now
    });
    const marker = coinCommerceDataPackRuntimeMarker(orderRef);
    let matches = runtimeCore.listTenants().filter((candidate) => candidate.note === marker);
    if (matches.length > 1 || (reservation.status === "issued" && matches.length !== 1)) {
      throw fail();
    }
    let tenant;
    if (matches.length === 0) {
      const created = runtimeCore.createTenant({
        displayName: `Data pack ${createHash("sha256").update(orderRef).digest("hex").slice(0, 12)}`,
        nodeId, expiresAt: TECHNICAL_VALID_UNTIL, note: marker
      });
      tenant = created?.tenant;
      matches = runtimeCore.listTenants().filter((candidate) => candidate.note === marker);
      if (matches.length !== 1 || matches[0].id !== tenant?.id) throw fail();
    } else {
      tenant = matches[0];
    }
    if ((tenant.nodeName ?? tenant.nodeId) !== nodeId || tenant.expiresAt !== TECHNICAL_VALID_UNTIL
      || tenant.status !== "active" || tenant.note !== marker) throw fail();
    let artifacts = runtimeCore.listSubscriptionArtifacts(tenant.id);
    if (!Array.isArray(artifacts) || artifacts.length > 1
      || (reservation.status === "issued" && artifacts.length !== 1)) throw fail();
    let artifact;
    if (artifacts.length === 0) {
      const created = runtimeCore.createSubscriptionArtifact(tenant.id);
      artifact = created?.artifact;
      if (typeof created?.subscriptionUrl !== "string") throw fail();
      try {
        materialEscrow.capture({
          orderRef, commandRef, tenantId: tenant.id,
          artifactId: artifact?.id, subscriptionUrl: created.subscriptionUrl
        });
      } catch {
        throw fail();
      }
      artifacts = runtimeCore.listSubscriptionArtifacts(tenant.id);
      if (artifacts.length !== 1 || artifacts[0].id !== artifact?.id) throw fail();
    } else {
      artifact = artifacts[0];
    }
    if (artifact?.tenantId !== tenant.id || artifact.status !== "active") throw fail();
    // If Core persisted the artifact but the protected material capture did
    // not commit, never mint a second artifact or claim successful delivery.
    try {
      materialEscrow.verify({ orderRef, commandRef, tenantId: tenant.id, artifactId: artifact.id });
    } catch {
      throw fail();
    }
    const tenantRef = runtimeRef("tenant", tenant.id);
    const artifactRef = runtimeRef("artifact", artifact.id);
    if (reservation.status === "issued") {
      const link = controlStore.getIssuedLink(`${reservation.requestRef}_link_1`);
      if (link?.tenantRef !== tenantRef || link?.artifactRef !== artifactRef
        || link?.requestId !== reservation.requestRef || link?.status !== "active") throw fail();
    }
    // A worker may lose its Commerce lease while constructing runtime
    // material. Keep the partially issued resource for the next exact worker
    // rather than finalizing control state under a stale claim.
    verifyCapture();
    const completed = controlStore.completeCoinCommerceDataPackIssuance({
      commandRef, orderRef, accountId, requestRef: reservation.requestRef,
      entitlementRef: reservation.entitlementRef, nodeId,
      tenantRef, artifactRef, now
    });
    return Object.freeze({
      status: completed.status, orderRef, requestRef: completed.requestRef,
      entitlementRef: completed.entitlementRef, issuedLinkRef: completed.issuedLinkRef,
      tenantRef, artifactRef
    });
  }

  return Object.freeze({ issue, markerFor: coinCommerceDataPackRuntimeMarker });
}
