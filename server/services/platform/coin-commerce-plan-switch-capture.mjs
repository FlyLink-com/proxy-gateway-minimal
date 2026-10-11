import { createSqliteSubscriptionControlStore } from "./subscription-control-db.mjs";
import { deriveCommerceOperationRefs } from "./coin-commerce-domain.mjs";
import { COIN_COMMERCE_PRODUCTION_FULFILLMENT_OFFER_VERSIONS } from "./coin-commerce-production-catalog.mjs";
import { readPlanSwitchQuoteForOrder } from "./coin-commerce-plan-switch-runtime.mjs";
import {
  PLAN_SWITCH_ERROR,
  planSwitchDurationMs,
  planSwitchTierForOfferVersionRef,
  precheckPlanSwitchAccount
} from "./coin-commerce-plan-switch-policy.mjs";
import { usageCycleForBinding } from "./usage-billing-cycle.mjs";

function isoMs(value) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isSafeInteger(parsed) && new Date(parsed).toISOString() === value
    ? parsed
    : null;
}

function inspectCurrentCaptureSafety(quote, facts, now) {
  const refuse = (reason = PLAN_SWITCH_ERROR.STATE_CHANGED) => ({ ok: false, reason });
  if (!facts || quote.account_id !== quote.order_account_id) return refuse();
  if (facts.commerceMode === null || facts.authorityRowCount === null) {
    return refuse(PLAN_SWITCH_ERROR.PRECHECK_UNAVAILABLE);
  }
  const precheck = precheckPlanSwitchAccount({
    authorityFlagEnabled: false,
    commerceMode: facts.commerceMode,
    authorityRowCount: facts.authorityRowCount
  });
  if (!precheck.ok) return refuse(precheck.code);

  const entitlement = facts.entitlement;
  if (!entitlement
    || entitlement.accountId !== quote.account_id
    || entitlement.id !== quote.entitlement_id
    || entitlement.plan !== quote.from_offer_version_ref
    || entitlement.validFrom !== quote.snapshot_valid_from
    || entitlement.validUntil !== quote.snapshot_valid_until) return refuse();
  const nowMs = isoMs(now);
  const fromMs = isoMs(entitlement.validFrom);
  const untilMs = isoMs(entitlement.validUntil);
  if (nowMs === null || fromMs === null || untilMs === null) {
    return refuse(PLAN_SWITCH_ERROR.PRECHECK_UNAVAILABLE);
  }
  if (fromMs > nowMs || untilMs <= nowMs) return refuse();

  const sourceTier = planSwitchTierForOfferVersionRef(quote.from_offer_version_ref);
  const targetTier = planSwitchTierForOfferVersionRef(quote.to_offer_version_ref);
  if (!sourceTier || !targetTier || sourceTier.durationDays !== 30
    || targetTier.durationDays !== 365 || targetTier.rank <= sourceTier.rank) return refuse();

  if (facts.scheduledSwitch?.ok !== true) {
    return refuse(PLAN_SWITCH_ERROR.PRECHECK_UNAVAILABLE);
  }
  const scheduled = facts.scheduledSwitch.row;
  if (scheduled) {
    if (scheduled.status === "applying") return refuse(PLAN_SWITCH_ERROR.APPLICATION_PENDING);
    const scheduledAtMs = isoMs(scheduled.effective_at);
    if (scheduledAtMs === null) return refuse(PLAN_SWITCH_ERROR.PRECHECK_UNAVAILABLE);
    if (scheduledAtMs <= nowMs) return refuse(PLAN_SWITCH_ERROR.APPLICATION_PENDING);
    const scheduledTier = planSwitchTierForOfferVersionRef(scheduled.to_offer_version_ref);
    if (scheduled.status !== "scheduled"
      || scheduled.switch_ref !== quote.cancels_switch_ref
      || scheduled.account_id !== quote.account_id
      || scheduled.entitlement_id !== quote.entitlement_id
      || scheduled.from_offer_version_ref !== quote.from_offer_version_ref
      || scheduled.effective_at !== quote.snapshot_valid_until
      || !scheduledTier || scheduledTier.rank >= sourceTier.rank
      || !Number.isSafeInteger(scheduled.paid_units) || scheduled.paid_units < 1
      || scheduled.paid_units !== quote.pending_credit_units) return refuse();
  } else if (quote.cancels_switch_ref !== null || quote.pending_credit_units !== 0) {
    return refuse();
  }

  // Capture preserves the confirmed charge and quote-time purchase window.
  // Recheck only live safety, including cycle alignment at the real capture time.
  const restartUntilMs = nowMs + planSwitchDurationMs(targetTier.durationDays);
  const restartUntil = new Date(restartUntilMs);
  if (!Number.isSafeInteger(restartUntilMs) || !Number.isFinite(restartUntil.getTime())) {
    return refuse(PLAN_SWITCH_ERROR.PRECHECK_UNAVAILABLE);
  }
  const currentCycle = usageCycleForBinding(entitlement, now);
  const restartCycle = usageCycleForBinding({
    plan: targetTier.offerVersionRef,
    validFrom: entitlement.validFrom,
    validUntil: restartUntil.toISOString()
  }, now);
  if (!currentCycle || !restartCycle) return refuse(PLAN_SWITCH_ERROR.PRECHECK_UNAVAILABLE);
  if (currentCycle.startedAt !== restartCycle.startedAt) {
    return refuse(PLAN_SWITCH_ERROR.CYCLE_MISALIGNED);
  }
  return { ok: true, reason: null };
}

// Internal transaction participant: owns no connection and has no runtime,
// network, clock or issuance capability. The caller owns BEGIN/COMMIT.
export function createPlanSwitchCaptureParticipant(database) {
  const control = createSqliteSubscriptionControlStore({ database, initializeSchema: false });
  function inspect(orderRef, now) {
    if (!database.inTransaction) throw new Error("plan_switch_capture_requires_transaction");
    const quote = readPlanSwitchQuoteForOrder(database, orderRef);
    if (quote?.kind !== "upgrade_restart") return null;
    const facts = control.readPlanSwitchAccountFacts({ accountId: quote.account_id, now });
    return inspectCurrentCaptureSafety(quote, facts, now);
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
