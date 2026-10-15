import { createHash, randomBytes, randomUUID } from "node:crypto";
import { types as utilTypes } from "node:util";

const REF = /^[a-z][a-z0-9_]{2,95}$/;

function unavailable() {
  const error = new Error("Data-pack credential reset requires reconciliation");
  error.code = "coin_commerce_data_pack_reset_reconciliation_required";
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

function newMaterial() {
  const material = { uuid: randomUUID(), password: randomBytes(32).toString("base64") };
  const digest = `sha256:${createHash("sha256")
    .update(material.uuid).update("\0").update(material.password).digest("hex")}`;
  return { material, digest };
}

// Source-only orchestration. A protected staged candidate survives crashes;
// the control digest switches before the protected active record, so an
// interrupted handoff fails closed until replay commits that same candidate.
// The old URL is revoked only after the exact new desired state is applied.
export function createCoinCommerceDataPackCredentialReset({
  commerceStore, controlStore, materialStore, desiredStateNotifier,
  artifactRotation, nowFn = () => new Date()
} = {}) {
  for (const [surface, names] of [
    [commerceStore, ["getDeliveredOrderBinding"]],
    [controlStore, ["readDataPackResourceUsage", "beginCoinCommerceDataPackCredentialReset",
      "claimCoinCommerceDataPackCredentialReset", "advanceCoinCommerceDataPackCredentialReset",
      "releaseCoinCommerceDataPackCredentialReset", "listPendingCoinCommerceDataPackCredentialResets",
      "getCoinCommerceDataPackMeteringResetReceipt"]],
    [materialStore, ["getCredentialMaterialSummary", "getStagedCredentialMaterialRotation",
      "stageCredentialMaterialRotation", "commitCredentialMaterialRotation"]],
    [desiredStateNotifier, ["notifyOrderLifecycle"]],
    [artifactRotation, ["rotate"]]
  ]) {
    if (!surface || names.some((name) => typeof surface[name] !== "function")) throw unavailable();
  }
  if (typeof nowFn !== "function") throw unavailable();

  function rotate(input) {
    const { accountId, orderRef, rotationRef } = exactRequest(input);
    const scope = { accountId, orderRef, rotationRef };
    const now = () => new Date(nowFn()).toISOString();
    const leaseRef = `packresetlease_${randomBytes(16).toString("hex")}`;
    let claimed = false;
    try {
      const order = commerceStore.getDeliveredOrderBinding({ accountId, orderRef });
      if (order?.kind !== "data_pack" || order.orderRef !== orderRef
        || !REF.test(order.requestRef) || !REF.test(order.entitlementRef)) throw unavailable();
      controlStore.readDataPackResourceUsage({ accountId, orderRef,
        requestRef: order.requestRef, entitlementRef: order.entitlementRef, now: now() });
      let intent = controlStore.beginCoinCommerceDataPackCredentialReset({ ...scope, now: now() });
      if (intent.requestRef !== order.requestRef
        || intent.entitlementRef !== order.entitlementRef) throw unavailable();
      if (intent.status === "complete") {
        if (!controlStore.getCoinCommerceDataPackMeteringResetReceipt({ ...scope, now: now() })) throw unavailable();
        return Object.freeze({ status: "complete", orderRef, rotationRef });
      }
      intent = controlStore.claimCoinCommerceDataPackCredentialReset({
        ...scope, leaseRef, now: now()
      });
      claimed = true;
      if (intent.status === "prepared") {
        const active = materialStore.getCredentialMaterialSummary(intent.edgeCredentialRef);
        if (active?.materialDigest !== intent.oldEdgeMaterialDigest) throw unavailable();
        let staged = materialStore.getStagedCredentialMaterialRotation(rotationRef);
        if (!staged) {
          const replacement = newMaterial();
          staged = materialStore.stageCredentialMaterialRotation({ rotationRef,
            credentialRef: intent.edgeCredentialRef,
            oldMaterialDigest: intent.oldEdgeMaterialDigest,
            newMaterialDigest: replacement.digest, material: replacement.material });
        }
        if (staged.rotationRef !== rotationRef
          || staged.credentialRef !== intent.edgeCredentialRef
          || staged.oldMaterialDigest !== intent.oldEdgeMaterialDigest
          || !/^sha256:[a-f0-9]{64}$/.test(staged.newMaterialDigest)) throw unavailable();
        intent = controlStore.advanceCoinCommerceDataPackCredentialReset({ ...scope, leaseRef,
          stage: "staged", newEdgeMaterialDigest: staged.newMaterialDigest, now: now() });
      }
      if (intent.status === "staged") {
        const staged = materialStore.getStagedCredentialMaterialRotation(rotationRef);
        if (staged?.credentialRef !== intent.edgeCredentialRef
          || staged.oldMaterialDigest !== intent.oldEdgeMaterialDigest
          || staged.newMaterialDigest !== intent.newEdgeMaterialDigest) throw unavailable();
        intent = controlStore.advanceCoinCommerceDataPackCredentialReset({ ...scope, leaseRef,
          stage: "control_switched", now: now() });
      }
      if (intent.status === "control_switched") {
        materialStore.commitCredentialMaterialRotation({ rotationRef,
          credentialRef: intent.edgeCredentialRef,
          oldMaterialDigest: intent.oldEdgeMaterialDigest,
          newMaterialDigest: intent.newEdgeMaterialDigest });
        if (materialStore.getCredentialMaterialSummary(intent.edgeCredentialRef)?.materialDigest
          !== intent.newEdgeMaterialDigest) throw unavailable();
        intent = controlStore.advanceCoinCommerceDataPackCredentialReset({ ...scope, leaseRef,
          stage: "material_committed", now: now() });
      }
      if (intent.status === "material_committed") {
        if (materialStore.getCredentialMaterialSummary(intent.edgeCredentialRef)?.materialDigest
          !== intent.newEdgeMaterialDigest) throw unavailable();
        const notified = desiredStateNotifier.notifyOrderLifecycle({
          reason: "coin_commerce_data_pack_credential_reset",
          order: { edgeChannelRef: intent.edgeChannelRef }
        });
        if (notified?.notificationCount !== 1
          || notified.notifications?.[0]?.channelRef !== intent.edgeChannelRef) throw unavailable();
        intent = controlStore.advanceCoinCommerceDataPackCredentialReset({ ...scope, leaseRef,
          stage: "edge_applied", now: now() });
      }
      if (intent.status === "edge_applied") {
        // The asynchronous external collector owns journal continuation. Keep
        // this durable intent pending until its exact receipt is readable.
        if (!controlStore.getCoinCommerceDataPackMeteringResetReceipt({ ...scope, now: now() })) throw unavailable();
        const artifact = artifactRotation.rotate(scope);
        if (artifact?.status !== "complete" || artifact.orderRef !== orderRef) throw unavailable();
        intent = controlStore.advanceCoinCommerceDataPackCredentialReset({ ...scope, leaseRef,
          stage: "complete", now: now() });
      }
      if (intent.status !== "complete") throw unavailable();
      return Object.freeze({ status: "complete", orderRef, rotationRef });
    } catch {
      throw unavailable();
    } finally {
      if (claimed) {
        try {
          controlStore.releaseCoinCommerceDataPackCredentialReset({ ...scope, leaseRef });
        } catch {
          throw unavailable();
        }
      }
    }
  }

  function reconcilePending({ limit = 10 } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw unavailable();
    const pending = controlStore.listPendingCoinCommerceDataPackCredentialResets({
      limit, now: new Date(nowFn()).toISOString()
    });
    let completed = 0;
    let failed = 0;
    for (const input of pending) {
      try { rotate(input); completed += 1; }
      catch { failed += 1; }
    }
    return Object.freeze({ inspected: pending.length, completed, failed });
  }

  return Object.freeze({ rotate, reconcilePending });
}
