import { createHash } from "node:crypto";

import { applyCoinDiscount } from "./coin-commerce-domain.mjs";
import {
  COIN_COMMERCE_PRODUCTION_FULFILLMENT_OFFER_VERSIONS
} from "./coin-commerce-production-catalog.mjs";
import {
  PLAN_SWITCH_ERROR,
  PLAN_SWITCH_LEGACY_COMMERCE_MODE,
  classifyPlanSwitch,
  computeSwitchCharge,
  planSwitchTierForOfferVersionRef,
  precheckPlanSwitchAccount
} from "./coin-commerce-plan-switch-policy.mjs";

const AUTHORITY_TABLE = "platform_account_resource_authorities";
const SCHEDULED_TABLE = "platform_scheduled_plan_switches";
const QUOTE_TABLE = "platform_coin_commerce_plan_switch_quotes";
const DUE_COMMAND_PREFIX = "planswitchdue_";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function frozenFailure(code) {
  return Object.freeze({ ok: false, code });
}

export function planSwitchDueCommandRef(switchRef) {
  return `${DUE_COMMAND_PREFIX}${sha256(
    `GCCWEBOS:PLAN_SWITCH_DUE:v1\0${switchRef}`
  ).slice(0, 40)}`;
}

export function planSwitchScheduledEffectRef(switchRef) {
  return `planswitchsched_${sha256(
    `GCCWEBOS:PLAN_SWITCH_SCHEDULED:v1\0${switchRef}`
  ).slice(0, 40)}`;
}

export function isPlanSwitchDueCommandRef(commandRef) {
  return typeof commandRef === "string"
    && commandRef.startsWith(DUE_COMMAND_PREFIX);
}

export function countAccountAuthorityRows(database, accountId) {
  try {
    const present = database.prepare(`
      select 1
        from sqlite_master
       where type = 'table' and name = ?
    `).get(AUTHORITY_TABLE);
    if (!present) return 0;
    const count = database.prepare(`
      select count(*)
        from ${AUTHORITY_TABLE}
       where account_id = ?
    `).pluck().get(accountId);
    return Number.isSafeInteger(count) && count >= 0 ? count : null;
  } catch {
    return null;
  }
}

export function commerceModeFromMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  if (!Object.hasOwn(metadata, "commercialModel")) {
    return PLAN_SWITCH_LEGACY_COMMERCE_MODE;
  }
  const value = metadata.commercialModel;
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    return null;
  }
  return value;
}

export function readOpenScheduledPlanSwitch(database, accountId) {
  const rows = database.prepare(`
    select switch_ref, account_id, entitlement_id, from_offer_version_ref,
           to_offer_version_ref, effective_at, paid_units, status
      from ${SCHEDULED_TABLE}
     where account_id = ? and status = 'scheduled'
     order by switch_ref asc
  `).all(accountId);
  if (rows.length > 1) return { ok: false };
  if (rows.length === 0) return { ok: true, row: null };
  const row = rows[0];
  if (!Number.isSafeInteger(row.paid_units) || row.paid_units < 1) {
    return { ok: false };
  }
  return { ok: true, row };
}

export function readPlanSwitchQuoteForOrder(database, orderRef) {
  return database.prepare(`
    select q.*,
           o.amount_units as order_amount_units,
           o.account_id as order_account_id,
           o.payment_status as order_payment_status
      from ${QUOTE_TABLE} q
      join platform_coin_commerce_orders o on o.quote_ref = q.quote_ref
     where o.order_ref = ?
  `).get(orderRef) ?? null;
}

export function readScheduledPlanSwitchByRef(database, switchRef) {
  return database.prepare(`
    select switch_ref, account_id, entitlement_id, from_offer_version_ref,
           to_offer_version_ref, effective_at, paid_units, status, created_at
      from ${SCHEDULED_TABLE}
     where switch_ref = ?
  `).get(switchRef) ?? null;
}

export function readPlanSwitchQuoteByRef(database, quoteRef) {
  return database.prepare(`
    select * from ${QUOTE_TABLE} where quote_ref = ?
  `).get(quoteRef) ?? null;
}

function isoMs(value) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed)) return null;
  if (new Date(parsed).toISOString() !== value) return null;
  return parsed;
}

export function evaluatePlanSwitchRequest({
  requestedOfferVersionRef,
  authorityFlagEnabled,
  commerceMode,
  authorityRowCount,
  nowIso,
  entitlement,
  scheduledSwitch
}) {
  if (!planSwitchTierForOfferVersionRef(requestedOfferVersionRef)) {
    return Object.freeze({ ok: true, ordinary: true, unmanaged: true });
  }
  if (
    authorityRowCount === null
    || commerceMode === null
    || typeof authorityFlagEnabled !== "boolean"
  ) {
    return frozenFailure(PLAN_SWITCH_ERROR.PRECHECK_UNAVAILABLE);
  }
  const nowMs = isoMs(nowIso);
  if (nowMs === null) return frozenFailure(PLAN_SWITCH_ERROR.PRECHECK_UNAVAILABLE);
  const precheck = precheckPlanSwitchAccount({
    authorityFlagEnabled,
    commerceMode,
    authorityRowCount
  });
  if (!precheck.ok) return precheck;
  if (scheduledSwitch && scheduledSwitch.ok === false) {
    return frozenFailure(PLAN_SWITCH_ERROR.PRECHECK_UNAVAILABLE);
  }
  const scheduled = scheduledSwitch?.row ?? null;
  let currentOfferVersionRef = null;
  let validUntilMs = null;
  let snapshotValidFrom = null;
  let snapshotValidUntil = null;
  let entitlementId = null;
  if (entitlement) {
    currentOfferVersionRef = entitlement.plan;
    snapshotValidFrom = entitlement.validFrom;
    snapshotValidUntil = entitlement.validUntil;
    entitlementId = entitlement.id;
    validUntilMs = isoMs(entitlement.validUntil);
    if (validUntilMs === null || isoMs(entitlement.validFrom) === null) {
      return frozenFailure(PLAN_SWITCH_ERROR.PRECHECK_UNAVAILABLE);
    }
  }
  const classified = classifyPlanSwitch({
    nowMs,
    currentOfferVersionRef,
    validUntilMs,
    requestedOfferVersionRef,
    scheduledSwitchRef: scheduled ? scheduled.switch_ref : null,
    scheduledEffectiveAtMs: scheduled ? isoMs(scheduled.effective_at) : null
  });
  if (!classified.ok) return classified;
  if (classified.kind === "ordinary_purchase") {
    return Object.freeze({ ok: true, ordinary: true, unmanaged: false });
  }
  const pendingCreditUnits = classified.cancelsSwitchRef
    ? scheduled.paid_units
    : 0;
  const charge = computeSwitchCharge({
    kind: classified.kind,
    fromOfferVersionRef: classified.fromOfferVersionRef,
    toOfferVersionRef: classified.toOfferVersionRef,
    remainingMs: classified.remainingMs,
    pendingCreditUnits
  });
  if (!charge.ok) return charge;
  const effectiveAt = classified.effectiveAtMs === null
    ? null
    : new Date(classified.effectiveAtMs).toISOString();
  if (classified.kind === "downgrade_scheduled" && effectiveAt !== snapshotValidUntil) {
    return frozenFailure(PLAN_SWITCH_ERROR.PRECHECK_UNAVAILABLE);
  }
  return Object.freeze({
    ok: true,
    ordinary: false,
    unmanaged: false,
    entitlementId,
    fromOfferVersionRef: classified.fromOfferVersionRef,
    toOfferVersionRef: classified.toOfferVersionRef,
    snapshotValidFrom,
    snapshotValidUntil,
    cancelsSwitchRef: classified.cancelsSwitchRef,
    effectiveAt,
    kind: charge.kind,
    listPriceUnits: charge.listPriceUnits,
    creditUnits: charge.creditUnits,
    pendingCreditUnits: charge.pendingCreditUnits,
    chargeUnits: charge.chargeUnits
  });
}

export function planSwitchQuoteMatchesDecision(row, decision) {
  if (!row || !decision || decision.ok !== true || decision.ordinary) return false;
  return row.kind === decision.kind
    && row.entitlement_id === decision.entitlementId
    && row.from_offer_version_ref === decision.fromOfferVersionRef
    && row.to_offer_version_ref === decision.toOfferVersionRef
    && row.snapshot_valid_from === decision.snapshotValidFrom
    && row.snapshot_valid_until === decision.snapshotValidUntil
    && row.list_price_units === decision.listPriceUnits
    && row.credit_units === decision.creditUnits
    && row.pending_credit_units === decision.pendingCreditUnits
    && row.charge_units === decision.chargeUnits
    && (row.cancels_switch_ref ?? null) === (decision.cancelsSwitchRef ?? null)
    && (row.effective_at ?? null) === (decision.effectiveAt ?? null);
}

export function discountedPlanSwitchAmount(decision, discountBasisPoints) {
  return applyCoinDiscount({
    baseCoinUnits: decision.chargeUnits,
    discountBasisPoints
  });
}

export function insertPlanSwitchQuote(database, row) {
  return database.prepare(`
    insert into ${QUOTE_TABLE} (
      quote_ref, account_id, entitlement_id, kind,
      from_offer_version_ref, to_offer_version_ref,
      snapshot_valid_from, snapshot_valid_until,
      list_price_units, credit_units, pending_credit_units, charge_units,
      cancels_switch_ref, effective_at, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.quoteRef,
    row.accountId,
    row.entitlementId,
    row.kind,
    row.fromOfferVersionRef,
    row.toOfferVersionRef,
    row.snapshotValidFrom,
    row.snapshotValidUntil,
    row.listPriceUnits,
    row.creditUnits,
    row.pendingCreditUnits,
    row.chargeUnits,
    row.cancelsSwitchRef,
    row.effectiveAt,
    row.createdAt
  );
}

export function deliverScheduledPlanDowngrade(database, row) {
  const existing = database.prepare(`
    select *
      from ${SCHEDULED_TABLE}
     where switch_ref = ?
  `).get(row.switchRef);
  const same = existing
    && existing.account_id === row.accountId
    && existing.entitlement_id === row.entitlementId
    && existing.from_offer_version_ref === row.fromOfferVersionRef
    && existing.to_offer_version_ref === row.toOfferVersionRef
    && existing.effective_at === row.effectiveAt
    && existing.paid_units === row.paidUnits
    && existing.created_at === row.createdAt;
  if (existing) {
    return same
      ? { ok: true, effectRef: planSwitchScheduledEffectRef(row.switchRef) }
      : { ok: false, drift: true };
  }
  database.prepare(`
    insert into ${SCHEDULED_TABLE} (
      switch_ref, account_id, entitlement_id,
      from_offer_version_ref, to_offer_version_ref,
      effective_at, paid_units, status, created_at,
      resolved_at, superseded_by_order_ref
    ) values (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, null, null)
  `).run(
    row.switchRef,
    row.accountId,
    row.entitlementId,
    row.fromOfferVersionRef,
    row.toOfferVersionRef,
    row.effectiveAt,
    row.paidUnits,
    row.createdAt
  );
  return { ok: true, effectRef: planSwitchScheduledEffectRef(row.switchRef) };
}

export function supersedeScheduledPlanSwitch(database, {
  switchRef,
  accountId,
  supersededByOrderRef,
  resolvedAt
}) {
  return database.prepare(`
    update ${SCHEDULED_TABLE}
       set status = 'superseded',
           resolved_at = ?,
           superseded_by_order_ref = ?
     where switch_ref = ?
       and account_id = ?
       and status = 'scheduled'
  `).run(resolvedAt, supersededByOrderRef, switchRef, accountId).changes === 1;
}

export function markScheduledPlanSwitchApplied(database, {
  switchRef,
  accountId,
  resolvedAt
}) {
  return database.prepare(`
    update ${SCHEDULED_TABLE}
       set status = 'applied',
           resolved_at = ?
     where switch_ref = ?
       and account_id = ?
       and status = 'scheduled'
  `).run(resolvedAt, switchRef, accountId).changes === 1;
}

export function listDueScheduledPlanSwitchRows(database, nowIso) {
  return database.prepare(`
    select switch_ref, account_id, to_offer_version_ref, effective_at
      from ${SCHEDULED_TABLE}
     where status = 'scheduled' and effective_at <= ?
     order by effective_at asc, switch_ref asc
  `).all(nowIso);
}

export function createPlanSwitchReader({ controlStore, authorityEnabled }) {
  if (typeof authorityEnabled !== "boolean" || !controlStore) {
    throw new Error("Plan switch reader is invalid");
  }
  return function planSwitchReader({ accountId, offerVersionRef, nowIso }) {
    let facts;
    try {
      facts = controlStore.readPlanSwitchAccountFacts({
        accountId,
        now: nowIso
      });
    } catch {
      return frozenFailure(PLAN_SWITCH_ERROR.PRECHECK_UNAVAILABLE);
    }
    if (!facts) return frozenFailure(PLAN_SWITCH_ERROR.PRECHECK_UNAVAILABLE);
    return evaluatePlanSwitchRequest({
      requestedOfferVersionRef: offerVersionRef,
      authorityFlagEnabled: authorityEnabled,
      commerceMode: facts.commerceMode,
      authorityRowCount: facts.authorityRowCount,
      nowIso,
      entitlement: facts.entitlement,
      scheduledSwitch: facts.scheduledSwitch
    });
  };
}

export function applyDueScheduledPlanSwitches({
  controlStore,
  execute,
  nowIso,
  catalog = COIN_COMMERCE_PRODUCTION_FULFILLMENT_OFFER_VERSIONS
}) {
  if (typeof execute !== "function") {
    return Object.freeze({ applied: 0 });
  }
  const due = controlStore.listDueScheduledPlanSwitches({ now: nowIso });
  let applied = 0;
  for (const row of due) {
    const offer = catalog.find(
      (candidate) => candidate.offerVersionRef === row.toOfferVersionRef
    );
    if (!offer) continue;
    try {
      const result = execute({
        commandRef: planSwitchDueCommandRef(row.switchRef),
        orderRef: row.switchRef,
        accountId: row.accountId,
        offerVersionRef: row.toOfferVersionRef,
        delivery: { ...offer.delivery }
      });
      if (result?.status === "delivered") applied += 1;
    } catch {
      // The row stays scheduled. The next tick retries it.
    }
  }
  return Object.freeze({ applied });
}
