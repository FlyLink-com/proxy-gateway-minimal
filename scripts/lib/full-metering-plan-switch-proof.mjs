// Read-only commerce evidence. No connection ownership, schema, clock, journal
// mutation or runtime capability. The collector supplies its read transaction.
import { createHash } from "node:crypto";
import { fullMeteringDigest } from "./full-metering-journal.mjs";
import { fullMeteringBindingIdentity } from "./full-metering-sample-writer.mjs";
import { deriveCommerceOperationRefs } from "../../server/services/platform/coin-commerce-domain.mjs";
import { planSwitchDueCommandRef, planSwitchScheduledEffectRef } from "../../server/services/platform/coin-commerce-plan-switch-runtime.mjs";
import { planSwitchTierForOfferVersionRef } from "../../server/services/platform/coin-commerce-plan-switch-policy.mjs";
import { usageCycleForBinding } from "../../server/services/platform/usage-billing-cycle.mjs";

const MAX_STEPS = 32, MAX_EFFECTS = 64, DAY = 86400000;
const IDENTITY_FIELDS = ["sourceRef", "channelRef", "edgeCredentialRef", "accountId", "entitlementId", "requestId", "materialDigest"];
const EFFECT_KEYS = ["version", "commandRef", "orderRef", "accountId", "requestRef", "entitlementRef", "issuedLinkRef", "tenantRef", "artifactRef",
  "offerVersionRef", "portalPlan", "durationDays", "monthlyTrafficGb", "trafficLimitBytes", "validFrom", "previousValidUntil", "targetValidUntil"];
class Unproven extends Error {}
const need = condition => { if (!condition) throw new Unproven(); };
const same = (a, b) => fullMeteringDigest(a) === fullMeteringDigest(b);
const tupleKey = tuple => fullMeteringDigest(tuple);
const exact = (object, keys) => object && typeof object === "object" && !Array.isArray(object)
  && Object.keys(object).sort().join(",") === [...keys].sort().join(",");
function iso(value) {
  need(typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
  return value;
}
function integer(value) {
  const result = typeof value === "bigint" ? Number(value) : value;
  need(Number.isSafeInteger(result));
  return result;
}
function json(value) {
  need(typeof value === "string" && Buffer.byteLength(value) <= 65536);
  try { return JSON.parse(value); } catch { throw new Unproven(); }
}
function effectRef(commandRef) {
  return `effect_coin_commerce_${createHash("sha256").update(`GCCWEBOS:COIN_COMMERCE_SUBSCRIPTION_FULFILLMENT:v1\0${commandRef}`).digest("hex")}`;
}
function unique(db, sql, ...args) {
  const rows = db.prepare(sql).all(...args);
  need(rows.length === 1);
  return rows[0];
}
function checkCurrent(db, identity, now) {
  const row = unique(db, `select e.account_id, e.status, e.plan, e.valid_from, e.valid_until, e.traffic_limit_bytes,
      a.status as account_status, r.account_id as request_account, r.entitlement_id, r.status as request_status,
      p.portal_user_ref, p.entitlement_ref, p.status as portal_status, p.valid_until as portal_until, p.expires_at
    from platform_entitlements e
    join platform_accounts a on a.id=e.account_id
    join platform_issuance_requests r on r.id=?
    join platform_portal_access_requests p on p.id=r.id where e.id=?`, identity.requestId, identity.entitlementId);
  need(row.account_id === identity.accountId && row.request_account === identity.accountId
    && row.portal_user_ref === identity.accountId && row.entitlement_id === identity.entitlementId
    && row.entitlement_ref === identity.entitlementId && row.status === "active" && row.account_status === "active"
    && row.request_status === "issued" && ["issued", "delivered"].includes(row.portal_status)
    && row.portal_until === row.valid_until && row.expires_at === row.valid_until
    && same({ plan: row.plan, validFrom: row.valid_from, validUntil: row.valid_until }, identity.billingBinding)
    && iso(row.valid_from) <= now && now < iso(row.valid_until));
  const tier = planSwitchTierForOfferVersionRef(row.plan);
  need(tier && integer(row.traffic_limit_bytes) === tier.monthlyTrafficGb * 1024 ** 3);
}
function readTransition(db, audit, identity, now, notBefore) {
  const metadata = json(audit.metadata_json);
  const switchKind = metadata?.switchKind ?? null;
  need(exact(metadata, switchKind === null ? EFFECT_KEYS : [...EFFECT_KEYS, "switchKind"])
    && (switchKind === null || ["upgrade_inplace", "upgrade_restart"].includes(switchKind))
    && metadata.version === 1 && audit.entity_type === "coin_commerce_subscription_fulfillment"
    && audit.entity_ref === identity.entitlementId && audit.action === "subscription_fulfillment_applied"
    && audit.actor_ref === "coin_commerce_fulfillment" && metadata.accountId === identity.accountId
    && metadata.entitlementRef === identity.entitlementId && metadata.requestRef === identity.requestId
    && typeof metadata.commandRef === "string" && typeof metadata.orderRef === "string"
    && iso(audit.created_at) >= notBefore && audit.created_at <= now
    && audit.id === effectRef(metadata.commandRef));
  const quote = unique(db, `select q.*, o.account_id as order_account, o.offer_version_ref as order_offer,
      o.amount_units as order_amount, o.payment_status, o.hold_ref, o.created_at as order_created
    from platform_coin_commerce_plan_switch_quotes q
    join platform_coin_commerce_orders o on o.quote_ref=q.quote_ref where o.order_ref=?`, metadata.orderRef);
  need(quote.account_id === identity.accountId && quote.order_account === identity.accountId
    && quote.entitlement_id === identity.entitlementId && quote.payment_status === "captured"
    && quote.to_offer_version_ref === metadata.offerVersionRef && quote.order_offer === metadata.offerVersionRef
    && iso(quote.created_at) <= audit.created_at && iso(quote.order_created) <= audit.created_at);
  const amount = integer(quote.order_amount);
  need(amount > 0);
  const commercialQuote = unique(db, `select account_id,offer_version_ref,amount_units,status,consumed_at
    from platform_coin_commerce_quotes where quote_ref=?`, quote.quote_ref);
  need(commercialQuote.account_id === identity.accountId && commercialQuote.offer_version_ref === metadata.offerVersionRef
    && commercialQuote.status === "consumed" && iso(commercialQuote.consumed_at) <= audit.created_at
    && integer(commercialQuote.amount_units) === amount);
  const hold = unique(db, `select h.*,w.account_id from platform_coin_holds h
    join platform_coin_wallets w on w.wallet_ref=h.wallet_ref where h.hold_ref=?`, quote.hold_ref);
  need(hold.account_id === identity.accountId && hold.status === "captured" && hold.purpose === "product_purchase"
    && hold.purpose_ref === metadata.orderRef && integer(hold.amount_units) === amount);
  const commandRef = deriveCommerceOperationRefs(metadata.orderRef).commandRef;
  const command = unique(db, `select * from platform_coin_commerce_fulfillment_commands where order_ref=?`, metadata.orderRef);
  need(command.command_ref === commandRef && command.account_id === identity.accountId && command.status === "delivered");
  const receipt = unique(db, `select * from platform_coin_commerce_fulfillment_receipts where command_ref=?`, commandRef);
  need(receipt.status === "delivered" && receipt.safe_code === null && iso(receipt.recorded_at) <= now
    && receipt.recorded_at === command.updated_at);
  const due = quote.kind === "downgrade_scheduled";
  need(metadata.commandRef === (due ? planSwitchDueCommandRef(metadata.orderRef) : commandRef)
    && receipt.effect_ref === (due ? planSwitchScheduledEffectRef(metadata.orderRef) : audit.id)
    && (due || receipt.recorded_at >= audit.created_at));
  const link = unique(db, `select request_id,tenant_ref,artifact_ref,status from platform_issued_subscription_links where id=?`, metadata.issuedLinkRef);
  need(link.request_id === identity.requestId && link.status === "active"
    && link.tenant_ref === metadata.tenantRef && link.artifact_ref === metadata.artifactRef);
  const sourceTier = planSwitchTierForOfferVersionRef(quote.from_offer_version_ref);
  const targetTier = planSwitchTierForOfferVersionRef(quote.to_offer_version_ref);
  need(sourceTier && targetTier);
  const payload = json(command.payload_json), delivery = payload?.delivery;
  need(exact(payload, ["offerVersionRef", "delivery"]) && payload.offerVersionRef === metadata.offerVersionRef
    && exact(delivery, ["kind", "durationDays", "monthlyTrafficGb", "trafficGb", "neverExpires", "discountBasisPoints"])
    && delivery.kind === "subscription_plan" && delivery.durationDays === targetTier.durationDays
    && delivery.monthlyTrafficGb === targetTier.monthlyTrafficGb && delivery.trafficGb === null
    && delivery.neverExpires === false && delivery.discountBasisPoints === 0
    && metadata.durationDays === targetTier.durationDays && metadata.monthlyTrafficGb === targetTier.monthlyTrafficGb
    && metadata.trafficLimitBytes === targetTier.monthlyTrafficGb * 1024 ** 3
    && metadata.portalPlan === (targetTier.durationDays >= 365 ? "yearly" : "monthly"));
  const before = { plan: quote.from_offer_version_ref, validFrom: iso(quote.snapshot_valid_from), validUntil: iso(metadata.previousValidUntil) };
  const after = { plan: quote.to_offer_version_ref, validFrom: iso(metadata.validFrom), validUntil: iso(metadata.targetValidUntil) };
  const quoteUntil = iso(quote.snapshot_valid_until), at = audit.created_at;
  need(before.validFrom < before.validUntil && after.validFrom < after.validUntil);
  let schedule = null;
  if (quote.kind === "upgrade_inplace") {
    need(switchKind === quote.kind && sourceTier.durationDays === 30 && targetTier.durationDays === 30
      && targetTier.rank > sourceTier.rank && quoteUntil === before.validUntil
      && after.validFrom === before.validFrom && after.validUntil === before.validUntil
      && before.validFrom <= at && at < before.validUntil && quote.effective_at === null);
  } else if (quote.kind === "upgrade_restart") {
    need(switchKind === quote.kind && sourceTier.durationDays === 30 && targetTier.durationDays === 365
      && targetTier.rank > sourceTier.rank && quoteUntil === before.validUntil && after.validFrom === before.validFrom
      && after.validUntil === new Date(Date.parse(at) + targetTier.durationDays * DAY).toISOString()
      && after.validUntil > before.validUntil && before.validFrom <= at && at < before.validUntil && quote.effective_at === null);
    const oldCycle = usageCycleForBinding(before, at), newCycle = usageCycleForBinding(after, at);
    need(oldCycle && newCycle && oldCycle.startedAt === newCycle.startedAt);
  } else if (quote.kind === "renewal") {
    // Additive renewals may have been confirmed from the same earlier snapshot.
    // The atomic applied effect supplies the actual previous expiry, not a guess.
    need(switchKind === null && before.plan === after.plan && before.validFrom === after.validFrom
      && quoteUntil <= before.validUntil && (quote.cancels_switch_ref === null || quoteUntil === before.validUntil)
      && after.validUntil === new Date(Math.max(Date.parse(at), Date.parse(before.validUntil)) + targetTier.durationDays * DAY).toISOString()
      && quote.effective_at === null);
  } else if (due) {
    need(switchKind === null && targetTier.rank < sourceTier.rank && quoteUntil === before.validUntil
      && quote.effective_at === before.validUntil && before.validUntil <= at
      && after.validFrom === at && after.validUntil === new Date(Date.parse(at) + targetTier.durationDays * DAY).toISOString());
    schedule = unique(db, `select * from platform_scheduled_plan_switches where switch_ref=?`, metadata.orderRef);
    need(schedule.status === "applied" && schedule.superseded_by_order_ref === null
      && schedule.account_id === identity.accountId && schedule.entitlement_id === identity.entitlementId
      && schedule.from_offer_version_ref === before.plan && schedule.to_offer_version_ref === after.plan
      && schedule.effective_at === before.validUntil && integer(schedule.paid_units) === amount
      && schedule.created_at === quote.created_at && iso(schedule.resolved_at) >= at && schedule.resolved_at <= now);
  } else { need(false); }
  // If a replacement consumes a scheduled credit, it must really have
  // superseded that same account/entitlement's pending switch.
  let superseded = null;
  if (quote.cancels_switch_ref !== null) {
    superseded = unique(db, `select * from platform_scheduled_plan_switches where switch_ref=?`, quote.cancels_switch_ref);
    need(!due && superseded.status === "superseded" && superseded.superseded_by_order_ref === metadata.orderRef
      && superseded.account_id === identity.accountId && superseded.entitlement_id === identity.entitlementId
      && superseded.from_offer_version_ref === before.plan && superseded.effective_at === before.validUntil
      && iso(superseded.resolved_at) === at);
  }
  return { before, after, at, evidence: { audit, quote, commercialQuote, hold, command, receipt, link, schedule, superseded } };
}

export function readFullMeteringPlanSwitchProof({ db, previousIdentity, currentIdentity, now, notBefore } = {}) {
  if (db?.inTransaction !== true) throw new Error("full_metering_proof_transaction_required");
  try {
    iso(now); iso(notBefore); need(notBefore <= now);
    let before, current;
    try { before = fullMeteringBindingIdentity(previousIdentity); current = fullMeteringBindingIdentity(currentIdentity); }
    catch { throw new Unproven(); }
    need(IDENTITY_FIELDS.every(field => before[field] === current[field]) && !same(before.billingBinding, current.billingBinding));
    checkCurrent(db, current, now);
    const audits = db.prepare(`select * from platform_audit_events where entity_ref=?
      and entity_type='coin_commerce_subscription_fulfillment' and action='subscription_fulfillment_applied'
      and created_at>=? order by created_at,id limit ?`).all(current.entitlementId, notBefore, MAX_EFFECTS + 1);
    need(audits.length > 0 && audits.length <= MAX_EFFECTS);
    const transitions = audits.map(audit => readTransition(db, audit, current, now, notBefore));
    let cursor = before.billingBinding, lastAt = notBefore;
    const seen = new Set([tupleKey(cursor)]), used = [];
    while (!same(cursor, current.billingBinding)) {
      need(used.length < MAX_STEPS);
      const next = transitions.filter(transition => same(transition.before, cursor));
      need(next.length === 1 && next[0].at >= lastAt && !used.includes(next[0]));
      const step = next[0], key = tupleKey(step.after);
      need(!seen.has(key)); seen.add(key); used.push(step); cursor = step.after; lastAt = step.at;
    }
    // An additional in-window applied effect cannot be ignored just because a
    // shorter chain reaches the live tuple; it could be a fork or a replay.
    need(used.length === transitions.length);
    return { ok: true, proof: { version: 1, kind: "commerce_billing_chain",
      fromIdentityDigest: fullMeteringDigest(before), toIdentityDigest: fullMeteringDigest(current),
      evidenceDigest: fullMeteringDigest(used.map(step => step.evidence)), transitionCount: used.length, changedAt: lastAt } };
  } catch (error) {
    if (error instanceof Unproven) return { ok: false, reason: "full_metering_plan_switch_unproven" };
    // SQLITE_BUSY/CORRUPT/missing schema and programming failures are not
    // converted into an apparently ordinary missing-proof result.
    throw error;
  }
}
