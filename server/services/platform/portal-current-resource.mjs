import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { snapshotWalletFirstCurrentResourceProjection } from "./wallet-first-current-resource-projection.mjs";
import { snapshotWalletFirstCurrentResourceSetupDelivery } from "./wallet-first-current-resource-setup-delivery.mjs";

const instances = new WeakSet();
const unavailable = "portal_current_resource_unavailable";
const reconciliation = "portal_current_resource_reconciliation_required";
function fail(code = unavailable) {
  return Object.assign(new Error("Portal current resource is unavailable"), { code });
}
function reference(value, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) throw fail("validation_error");
  return value;
}
export function snapshotPortalCurrentResourceService(service) {
  if (!instances.has(service)) throw fail();
  return service;
}

/** One authenticated facade over the existing commercial models, not a model transition.
 * Legacy setup only re-reads an already delivered URL. It never calls issuance,
 * refresh/rotation, activation, settlement or a deferred-transition writer.
 */
export function createPortalCurrentResourceService({
  controlStore, accessRequests, runtimeCore, walletFirstProjection, walletFirstSetupDelivery,
  nowFn = () => new Date()
}) {
  function historicalArtifactOwnershipVerified(result, now) {
    try {
      const lineage = result.artifactLineageNeeded;
      if (!lineage
        || typeof lineage.tenantId !== "string" || !lineage.tenantId
        || typeof lineage.currentArtifactId !== "string" || !lineage.currentArtifactId
        || !/^artifactref_[a-f0-9]{16}$/.test(lineage.issuedArtifactRef)
        || typeof runtimeCore?.getTenant !== "function"
        || typeof runtimeCore?.listSubscriptionArtifacts !== "function"
      ) return false;
      const tenant = runtimeCore.getTenant(lineage.tenantId);
      if (tenant?.id !== lineage.tenantId
        || !["active", "expiring"].includes(tenant.status)
        || tenant.expiresAt !== result.resource.validUntil
        || !Number.isFinite(Date.parse(tenant.expiresAt))
        || Date.parse(tenant.expiresAt) <= Date.parse(now)
      ) return false;
      const artifacts = runtimeCore.listSubscriptionArtifacts(lineage.tenantId);
      if (!Array.isArray(artifacts)
        || artifacts.some((artifact) => !artifact || typeof artifact.id !== "string"
          || !artifact.id || artifact.tenantId !== lineage.tenantId)
        || new Set(artifacts.map((artifact) => artifact.id)).size !== artifacts.length
      ) return false;
      const original = artifacts.filter((artifact) => (
        `artifactref_${createHash("sha256").update(artifact.id).digest("hex").slice(0, 16)}` === lineage.issuedArtifactRef
      ));
      const active = artifacts.filter((artifact) => artifact.status === "active");
      // The legacy runtime has no persisted replacement-of edge. This proves
      // the rotated original and unique current artifact belong to the exact
      // bound tenant; it does not invent a complete historical rotation chain.
      return original.length === 1 && original[0].status === "rotated"
        && active.length === 1 && active[0].id === lineage.currentArtifactId;
    } catch {
      return false;
    }
  }

  function read(accountId) {
    // Legacy account references use the control-store grammar, not the
    // narrower wallet-first identifier grammar. The store validates further.
    reference(accountId, /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/);
    try {
      const clock = nowFn();
      const now = clock instanceof Date ? clock.toISOString() : new Date(clock).toISOString();
      const result = controlStore.readLegacyPortalCurrentResource({ accountId, now });
      if (result?.model === "wallet_first") return result;
      if (result?.model !== "legacy" || !["none", "available", "reconciliation_required"].includes(result.resource?.state)) throw fail();
      if (result.resource.state === "available" && result.resource.validUntil <= now) throw fail();
      if (result.resource.state === "available" && Object.hasOwn(result, "artifactLineageNeeded")
        && !historicalArtifactOwnershipVerified(result, now)) {
        return { model: "legacy", resource: { state: "reconciliation_required" }, requestRef: null };
      }
      return result;
    } catch { throw fail(); }
  }
  function ownedAvailable(result) {
    if (result.resource?.state !== "available" || !result.resource.setupAvailable || !result.requestRef) throw fail(reconciliation);
    return result.resource;
  }
  function session(value) {
    return reference(value, /^[A-Za-z0-9_-]{3,192}$/);
  }
  // No new persisted delivery is created for an already issued legacy resource.
  // The receipt binds the UI acknowledgement to this session and resource only.
  // Re-reading after reload/restart is safe; replacement/expiry invalidates it.
  function handoff(accountId, sessionRef, resourceRef) {
    return `legacy_setup_${createHmac("sha256", sessionRef).update(JSON.stringify([accountId, resourceRef])).digest("hex")}`;
  }
  const service = Object.freeze({
    getCurrentOverview({ accountId }) {
      const result = read(accountId);
      if (result.model === "wallet_first") return snapshotWalletFirstCurrentResourceProjection(walletFirstProjection).getCurrentOverview({ accountId });
      return result.resource;
    },
    getCurrentResource({ accountId }) {
      const result = read(accountId);
      if (result.model === "wallet_first") return snapshotWalletFirstCurrentResourceProjection(walletFirstProjection).getCurrentResource({ accountId });
      const { state, plan, validUntil, setupAvailable } = result.resource;
      return state === "available" ? { state, plan, validUntil, setupAvailable } : { state };
    },
    deliverSetup({ accountId, sessionRef, idempotencyKey }) {
      session(sessionRef);
      reference(idempotencyKey, /^[A-Za-z0-9][A-Za-z0-9._~-]{15,127}$/);
      const result = read(accountId);
      if (result.model === "wallet_first") return snapshotWalletFirstCurrentResourceSetupDelivery(walletFirstSetupDelivery).deliverSetup({ accountId, sessionRef, idempotencyKey });
      const resource = ownedAvailable(result);
      const revealed = accessRequests.revealSubscription({ portalUserRef: accountId, requestRef: result.requestRef });
      if (revealed?.id !== result.requestRef || revealed.portalUserRef !== accountId
        || !["issued", "delivered"].includes(revealed.status) || revealed.validUntil !== resource.validUntil) throw fail(reconciliation);
      let url;
      try { url = new URL(revealed.subscriptionUrl); } catch { throw fail(); }
      if (url.protocol !== "https:" || url.username || url.password || url.hash) throw fail();
      return { delivery: {
        handoffRef: handoff(accountId, sessionRef, resource.resourceRef), kind: "subscription_url",
        subscriptionUrl: revealed.subscriptionUrl
      } };
    },
    acknowledgeSetup({ accountId, sessionRef, handoffRef }) {
      session(sessionRef);
      const result = read(accountId);
      if (result.model === "wallet_first") return snapshotWalletFirstCurrentResourceSetupDelivery(walletFirstSetupDelivery).acknowledgeSetup({ accountId, sessionRef, handoffRef });
      const resource = ownedAvailable(result);
      const expected = handoff(accountId, sessionRef, resource.resourceRef);
      if (typeof handoffRef !== "string" || !/^legacy_setup_[a-f0-9]{64}$/.test(handoffRef)
        || !timingSafeEqual(Buffer.from(expected), Buffer.from(handoffRef))) throw fail(reconciliation);
    }
  });
  instances.add(service);
  return service;
}
