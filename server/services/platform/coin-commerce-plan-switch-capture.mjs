import { createSqliteSubscriptionControlStore } from "./subscription-control-db.mjs";
import { deriveCommerceOperationRefs } from "./coin-commerce-domain.mjs";
import { COIN_COMMERCE_PRODUCTION_FULFILLMENT_OFFER_VERSIONS } from "./coin-commerce-production-catalog.mjs";
import { evaluatePlanSwitchRequest, readPlanSwitchQuoteForOrder } from "./coin-commerce-plan-switch-runtime.mjs";

// Internal transaction participant: owns no connection and has no runtime,
// network, clock or issuance capability. The caller owns BEGIN/COMMIT.
export function createPlanSwitchCaptureParticipant(database) {
  const control = createSqliteSubscriptionControlStore({ database, initializeSchema: false });
  function inspect(orderRef, now) {
    if (!database.inTransaction) throw new Error("plan_switch_capture_requires_transaction");
    const quote = readPlanSwitchQuoteForOrder(database, orderRef);
    if (quote?.kind !== "upgrade_restart") return null;
    const facts = control.readPlanSwitchAccountFacts({ accountId: quote.account_id, now });
    const decision = evaluatePlanSwitchRequest({
      requestedOfferVersionRef: quote.to_offer_version_ref,
      authorityFlagEnabled: false, commerceMode: facts.commerceMode,
      authorityRowCount: facts.authorityRowCount, entitlement: facts.entitlement,
      scheduledSwitch: facts.scheduledSwitch, nowIso: now
    });
    const ok = decision?.ok === true && decision.kind === quote.kind
      && decision.entitlementId === quote.entitlement_id
      && decision.fromOfferVersionRef === quote.from_offer_version_ref
      && decision.snapshotValidFrom === quote.snapshot_valid_from
      && decision.snapshotValidUntil === quote.snapshot_valid_until
      && decision.cancelsSwitchRef === quote.cancels_switch_ref;
    // Do not reprice a confirmed quote as wall-clock proration changes.
    return { ok, reason: decision?.code ?? "plan_switch_state_changed" };
  }
  function apply(orderRef, now) {
    if (!database.inTransaction) throw new Error("plan_switch_capture_requires_transaction");
    const quote = readPlanSwitchQuoteForOrder(database, orderRef);
    if (!quote || quote.kind !== "upgrade_restart" || quote.order_payment_status !== "captured"
      || quote.account_id !== quote.order_account_id || inspect(orderRef, now)?.ok !== true) {
      throw new Error("plan_switch_capture_state_changed");
    }
    const offer = COIN_COMMERCE_PRODUCTION_FULFILLMENT_OFFER_VERSIONS.find(
      (item) => item.offerVersionRef === quote.to_offer_version_ref);
    const requests = control.listPortalAccessRequests({ portalUserRef: quote.account_id })
      .filter((item) => ["delivered", "issued"].includes(item.status)
        && item.entitlementRef === quote.entitlement_id);
    if (!offer || requests.length !== 1) throw new Error("plan_switch_capture_binding_invalid");
    const request = requests[0];
    const bindings = control.listIssuedSubscriptionBindings({ accountId: quote.account_id })
      .filter((item) => item.requestId === request.id && item.entitlementId === quote.entitlement_id);
    if (bindings.length !== 1) throw new Error("plan_switch_capture_binding_invalid");
    const binding = bindings[0];
    const refs = deriveCommerceOperationRefs(orderRef);
    const command = database.prepare(`select command_ref from platform_coin_commerce_fulfillment_commands
      where order_ref = ? and account_id = ?`).get(orderRef, quote.account_id);
    if (command?.command_ref !== refs.commandRef) throw new Error("plan_switch_capture_outbox_invalid");
    return control.applyCoinCommerceSubscriptionFulfillment({
      commandRef: refs.commandRef, orderRef, accountId: quote.account_id,
      requestRef: request.id, entitlementRef: quote.entitlement_id,
      issuedLinkRef: binding.id, tenantRef: binding.tenantRef, artifactRef: binding.artifactRef,
      offerVersionRef: offer.offerVersionRef, portalPlan: "yearly",
      durationDays: offer.delivery.durationDays, monthlyTrafficGb: offer.delivery.monthlyTrafficGb,
      initialIssuance: false, requireExistingEffect: false, recoveryOnly: false,
      planSwitch: { kind: quote.kind, cancelsSwitchRef: quote.cancels_switch_ref,
        switchRef: null, expectedPlan: quote.from_offer_version_ref,
        expectedValidFrom: quote.snapshot_valid_from, expectedValidUntil: quote.snapshot_valid_until }, now
    });
  }
  return Object.freeze({ inspect, apply });
}
