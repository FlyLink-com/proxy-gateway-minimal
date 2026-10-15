import { createHash, randomBytes } from "node:crypto";
import { types as utilTypes } from "node:util";
import { coinCommerceDataPackRuntimeMarker } from "./coin-commerce-data-pack-runtime-issuer.mjs";

const REF = /^[a-z][a-z0-9_]{2,95}$/;

function unavailable() {
  const error = new Error("Data-pack artifact rotation requires reconciliation");
  error.code = "coin_commerce_data_pack_rotation_reconciliation_required";
  return error;
}

function exactRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== 3) throw unavailable();
  const result = {};
  for (const field of ["accountId", "orderRef", "rotationRef"]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")
      || typeof descriptor.value !== "string" || !REF.test(descriptor.value)) throw unavailable();
    result[field] = descriptor.value;
  }
  return result;
}

function runtimeRef(id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{3,128}$/.test(id)) throw unavailable();
  return `artifactref_${createHash("sha256").update(id).digest("hex").slice(0, 16)}`;
}

function tenantRef(id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{3,128}$/.test(id)) throw unavailable();
  return `tenantref_${createHash("sha256").update(id).digest("hex").slice(0, 16)}`;
}

function attemptedArtifactId(orderRef, rotationRef, attempt) {
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 16) throw unavailable();
  return `artifact_packrot_${createHash("sha256")
    .update(`${orderRef}\0${rotationRef}\0${attempt}`).digest("hex").slice(0, 48)}`;
}

// A pack-specific, replayable source-only rotation. It changes only the
// subscription artifact, never the edge principal, entitlement, or usage.
// The request's rotationRef is an idempotency key, not a material credential.
export function createCoinCommerceDataPackArtifactRotation({
  commerceStore, controlStore, runtimeCore, materialEscrow, nowFn = () => new Date()
} = {}) {
  if (!commerceStore?.getDeliveredOrderBinding
    || !controlStore?.readDataPackResourceUsage
    || !controlStore?.beginCoinCommerceDataPackArtifactRotation
    || !controlStore?.claimCoinCommerceDataPackArtifactRotation
    || !controlStore?.releaseCoinCommerceDataPackArtifactRotation
    || !controlStore?.listPendingCoinCommerceDataPackArtifactRotations
    || !controlStore?.advanceCoinCommerceDataPackArtifactRotation
    || !controlStore?.getIssuedLink || !controlStore?.getIssuanceRequest
    || !runtimeCore?.listTenants || !runtimeCore?.listSubscriptionArtifacts
    || !runtimeCore?.createSubscriptionArtifact || !runtimeCore?.revokeSubscriptionArtifact
    || !materialEscrow?.capture || !materialEscrow?.probe || !materialEscrow?.verify
    || typeof nowFn !== "function") throw unavailable();

  function rotate(input) {
    const { accountId, orderRef, rotationRef } = exactRequest(input);
    const leaseRef = `packrotlease_${randomBytes(16).toString("hex")}`;
    let claimed = false;
    try {
      const order = commerceStore.getDeliveredOrderBinding({ accountId, orderRef });
      if (order?.kind !== "data_pack" || order.orderRef !== orderRef
        || !REF.test(order.requestRef) || !REF.test(order.entitlementRef)) throw unavailable();
      const timestamp = () => new Date(nowFn()).toISOString();
      const now = timestamp();
      // This validates the resource and account ownership but does not write
      // a counter or synthesize any usage for the interval before rotation.
      controlStore.readDataPackResourceUsage({ accountId, orderRef,
        requestRef: order.requestRef, entitlementRef: order.entitlementRef, now });
      let intent = controlStore.beginCoinCommerceDataPackArtifactRotation({
        accountId, orderRef, rotationRef, now
      });
      intent = controlStore.claimCoinCommerceDataPackArtifactRotation({
        accountId, orderRef, rotationRef, leaseRef, now
      });
      claimed = true;
      const link = controlStore.getIssuedLink(intent.linkRef);
      if (link?.requestId !== order.requestRef || link.status !== "active"
        || link.tenantRef == null
        || (intent.status === "prepared" || intent.status === "escrowed"
          ? link.artifactRef !== intent.oldArtifactRef
          : link.artifactRef !== intent.replacementArtifactRef)) throw unavailable();
      const tenants = runtimeCore.listTenants().filter(
        (candidate) => candidate.note === coinCommerceDataPackRuntimeMarker(orderRef)
      );
      if (tenants.length !== 1 || tenantRef(tenants[0].id) !== link.tenantRef) throw unavailable();
      const tenant = tenants[0];
      const list = () => runtimeCore.listSubscriptionArtifacts(tenant.id);
      const old = list().filter((artifact) => runtimeRef(artifact.id) === intent.oldArtifactRef);
      if (old.length !== 1 || old[0].tenantId !== tenant.id) throw unavailable();
      if (["prepared", "escrowed"].includes(intent.status)
        && old[0].status !== "active") throw unavailable();
      const issuance = controlStore.getIssuanceRequest(order.requestRef);
      if (issuance?.metadata?.kind !== "data_pack"
        || issuance.metadata.orderRef !== orderRef
        || issuance.metadata.offerVersionRef !== order.offerVersionRef
        || !REF.test(issuance.metadata.commandRef)) throw unavailable();
      const scope = (artifact) => ({ orderRef,
        commandRef: issuance.metadata.commandRef,
        tenantId: tenant.id, artifactId: artifact.id });

      if (intent.status === "prepared") {
        if (old[0].status !== "active") throw unavailable();
        let replacement;
        while (!replacement) {
          const expectedId = attemptedArtifactId(orderRef, rotationRef, intent.attempt);
          const artifacts = list();
          const extraActive = artifacts.filter((artifact) => artifact.status === "active"
            && artifact.id !== old[0].id);
          if (extraActive.some((artifact) => artifact.id !== expectedId)) throw unavailable();
          const candidates = artifacts.filter((artifact) => artifact.id === expectedId);
          if (candidates.length > 1) throw unavailable();
          const candidate = candidates[0];
          if (candidate?.status === "revoked") {
            intent = controlStore.advanceCoinCommerceDataPackArtifactRotation({
              accountId, orderRef, rotationRef, stage: "retry", attempt: intent.attempt,
              now: timestamp(), leaseRef
            });
            continue;
          }
          if (candidate) {
            if (candidate.status !== "active" || candidate.tenantId !== tenant.id) throw unavailable();
            const candidateState = materialEscrow.probe(scope(candidate));
            if (candidateState === "absent") {
              // Only the deterministic artifact for this exact operation may
              // be discarded after a crash before protected capture.
              const revoked = runtimeCore.revokeSubscriptionArtifact(candidate.id);
              if (revoked?.status !== "revoked") throw unavailable();
              intent = controlStore.advanceCoinCommerceDataPackArtifactRotation({
                accountId, orderRef, rotationRef, stage: "retry", attempt: intent.attempt,
                now: timestamp(), leaseRef
              });
              continue;
            }
            if (candidateState !== "available") throw unavailable();
            replacement = candidate;
          } else {
            const created = runtimeCore.createSubscriptionArtifact(tenant.id,
              { artifactId: expectedId });
            replacement = created?.artifact;
            if (replacement?.id !== expectedId || replacement.tenantId !== tenant.id
              || replacement.status !== "active"
              || typeof created.subscriptionUrl !== "string") throw unavailable();
            materialEscrow.capture({ ...scope(replacement), subscriptionUrl: created.subscriptionUrl });
          }
        }
        materialEscrow.verify(scope(replacement));
        intent = controlStore.advanceCoinCommerceDataPackArtifactRotation({
          accountId, orderRef, rotationRef, stage: "escrowed",
          replacementArtifactRef: runtimeRef(replacement.id), now: timestamp(), leaseRef
        });
      }
      const replacement = list().filter((artifact) =>
        runtimeRef(artifact.id) === intent.replacementArtifactRef);
      if (replacement.length !== 1 || replacement[0].tenantId !== tenant.id
        || replacement[0].status !== "active") throw unavailable();
      materialEscrow.verify(scope(replacement[0]));
      if (intent.status === "escrowed") {
        intent = controlStore.advanceCoinCommerceDataPackArtifactRotation({
          accountId, orderRef, rotationRef, stage: "switched", now: timestamp(), leaseRef
        });
      }
      if (intent.status === "switched") {
        if (old[0].status === "active") {
          const revoked = runtimeCore.revokeSubscriptionArtifact(old[0].id);
          if (revoked?.status !== "revoked") throw unavailable();
        } else if (old[0].status !== "revoked") throw unavailable();
        intent = controlStore.advanceCoinCommerceDataPackArtifactRotation({
          accountId, orderRef, rotationRef, stage: "complete", now: timestamp(), leaseRef
        });
      }
      const finalArtifacts = list();
      if (intent.status !== "complete"
        || finalArtifacts.find((artifact) => artifact.id === old[0].id)?.status !== "revoked"
        || finalArtifacts.filter((artifact) => artifact.status === "active").length !== 1
        || finalArtifacts.find((artifact) => artifact.status === "active")?.id !== replacement[0].id) {
        throw unavailable();
      }
      return Object.freeze({ status: "complete", rotationRef, orderRef,
        artifactRef: intent.replacementArtifactRef });
    } catch {
      throw unavailable();
    } finally {
      if (claimed) {
        try {
          controlStore.releaseCoinCommerceDataPackArtifactRotation({
            accountId, orderRef, rotationRef, leaseRef
          });
        } catch {
          throw unavailable();
        }
      }
    }
  }

  function reconcilePending({ limit = 10 } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw unavailable();
    const pending = controlStore.listPendingCoinCommerceDataPackArtifactRotations({
      limit, now: new Date(nowFn()).toISOString()
    });
    let completed = 0;
    let failed = 0;
    for (const input of pending) {
      try {
        rotate(input);
        completed += 1;
      } catch {
        failed += 1;
      }
    }
    return Object.freeze({ inspected: pending.length, completed, failed });
  }

  return Object.freeze({ rotate, reconcilePending });
}
