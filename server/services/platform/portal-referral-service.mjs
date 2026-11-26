import Database from "better-sqlite3";
import { isAbsolute } from "node:path";
import { randomBytes } from "node:crypto";
import { createSqliteCoinWalletStore } from "./coin-wallet-store.mjs";
import { validatePortalReferralSchema } from "./portal-referral-migrations.mjs";
import {
  REFERRAL_CODE,
  digest,
  policySnapshot,
  referralError,
  requireRef,
  rewardUnits,
  timestamp,
  units,
} from "./portal-referral-contract.mjs";
import { paymentSettlementIdentity } from "./payment-recharge-coordinator.mjs";
import { reverseReferralReward } from "./portal-referral-wallet.mjs";
import { assertWritable } from "./single-writer-authority.mjs";

const addDays = (date, days) =>
  timestamp(new Date(Date.parse(date) + days * 86400000));
const sourceRefFor = (account) =>
  `referral_origin_${digest(account).slice(0, 32)}`;

// D1 dangling-reference log (see coin-commerce-store.mjs): a child row
// whose parent table was excluded from the E4 load is "unmigrated" and
// is downgraded, never silently dropped. Only synthetic refs are logged.
function logDangling(kind, detail = {}) {
  console.warn(`[d1-dangling] ${kind} ${JSON.stringify(detail)}`);
}
const internalConfirmationRef = (account) => `internal_confirm_${sourceRefFor(account)}`;
export function createPortalReferralService({
  database,
  dbPath,
  nowFn = () => new Date(),
  riskReader,
  refundReader,
  attributionDays,
  rewardsEnabled = false,
} = {}) {
  if (typeof rewardsEnabled !== "boolean")
    throw referralError("referral_rewards_configuration_invalid");
  if (
    (!rewardsEnabled || attributionDays !== undefined) &&
    (!Number.isSafeInteger(attributionDays) || attributionDays < 1 || attributionDays > 365)
  )
    throw referralError("referral_attribution_days_invalid");
  if (
    (database === undefined) === (dbPath === undefined) ||
    (dbPath !== undefined && !isAbsolute(dbPath))
  )
    throw referralError();
  const owned = database === undefined;
  const db = database || new Database(dbPath, { fileMustExist: true });
  try {
    db.pragma("foreign_keys=ON");
    db.pragma("busy_timeout=5000");
    if (!validatePortalReferralSchema(db))
      throw referralError("referral_schema_not_ready");
  } catch (error) {
    if (owned) db.close();
    throw error;
  }
  let wallet;
  try {
    wallet = createSqliteCoinWalletStore({ database: db, nowFn });
  } catch (error) {
    if (owned) db.close();
    throw error;
  }
  const now = () => timestamp(nowFn());
  function active(accountId) {
    requireRef(accountId);
    if (
      db
        .prepare("select status from platform_accounts where id=?")
        .get(accountId)?.status !== "active"
    )
      throw referralError("referral_account_ineligible");
  }
  function policyAt(at) {
    const row = db
      .prepare(
        "select policy_json from platform_referral_policies where effective_at<=? order by effective_at desc limit 1",
      )
      .get(at);
    return row ? policySnapshot(JSON.parse(row.policy_json)) : null;
  }
  function event(eventRef, accountId, kind, payload) {
    // U-F4: phase fence, first statement — the referral ledger insert
    // below must not land while the writer authority is not BWH_ACTIVE.
    assertWritable(db);
    requireRef(eventRef);
    requireRef(accountId);
    const hash = digest(JSON.stringify({ accountId, kind, payload }));
    const prior = db
      .prepare("select digest from platform_referral_events where event_ref=?")
      .get(eventRef);
    if (prior) {
      if (prior.digest !== hash) throw referralError("referral_event_conflict");
      return false;
    }
    db.prepare("insert into platform_referral_events values(?,?,?,?,?)").run(
      eventRef,
      accountId,
      kind,
      hash,
      now(),
    );
    return true;
  }
  function publishPolicy(input) {
    const policy = policySnapshot(input),
      json = JSON.stringify(policy),
      hash = digest(json);
    return db
      .transaction(() => {
        // U-F4: phase fence, first statement.
        assertWritable(db);
        const prior = db
          .prepare(
            "select digest from platform_referral_policies where policy_ref=? and version=?",
          )
          .get(policy.policyRef, policy.version);
        if (prior) {
          if (prior.digest !== hash)
            throw referralError("referral_policy_immutable");
          return policy;
        }
        // A newly published policy cannot change the policy selected for an already
        // observed first recharge. Retroactive policy publication is not supported.
        if (policy.effectiveAt < now())
          throw referralError("referral_policy_retroactive");
        db.prepare(
          "insert into platform_referral_policies values(?,?,?,?,?)",
        ).run(policy.policyRef, policy.version, policy.effectiveAt, json, hash);
        return policy;
      })
      .immediate();
  }
  function profile(accountId) {
    active(accountId);
    const row = db
      .prepare(
        "select code,status from platform_referral_profiles where account_id=?",
      )
      .get(accountId);
    const policy = rewardsEnabled ? policyAt(now()) : null;
    return {
      eligible: row?.status !== "disabled",
      linkPath: row?.status === "active" ? `/r/${row.code}` : null,
      attributionDays: rewardsEnabled ? policy?.attributionDays ?? null : attributionDays,
      policy,
    };
  }
  function createLink(accountId) {
    return db
      .transaction(() => {
        // U-F4: phase fence, first statement.
        assertWritable(db);
        active(accountId);
        const existing = db
          .prepare(
            "select status from platform_referral_profiles where account_id=?",
          )
          .get(accountId);
        if (existing?.status === "disabled")
          throw referralError("referral_account_ineligible");
        if (rewardsEnabled && !policyAt(now()))
          throw referralError("referral_policy_unavailable");
        if (!existing)
          db.prepare(
            "insert into platform_referral_profiles values(?,?,'active',?)",
          ).run(accountId, randomBytes(24).toString("base64url"), now());
        return profile(accountId);
      })
      .immediate();
  }
  function capture(code) {
    if (!REFERRAL_CODE.test(code || "")) return null;
    return db
      .transaction(() => {
        // U-F4: phase fence, first statement.
        assertWritable(db);
        const at = now(),
          windowDays = rewardsEnabled ? policyAt(at)?.attributionDays : attributionDays;
        if (!windowDays) return null;
        const promoter = db
          .prepare(
            `select p.account_id from platform_referral_profiles p
        join platform_accounts a on a.id=p.account_id where p.code=? and p.status='active' and a.status='active'`,
          )
          .get(code);
        if (!promoter) return null;
        const token = randomBytes(24).toString("base64url"),
          expiresAt = addDays(at, windowDays);
        db.prepare("insert into platform_referral_touches values(?,?,?,?)").run(
          digest(token),
          promoter.account_id,
          at,
          expiresAt,
        );
        return { token, expiresAt, maxAge: windowDays * 86400 };
      })
      .immediate();
  }
  function readFirstVerifiedRecharge(accountId) {
    // Wallet versions are per-account monotonically increasing durable credit
    // sequence. Consider unclosed credits too; never skip one for a later order.
    const first = db
      .prepare(
        `select l.*, e.operation_ref, e.resulting_wallet_version,
        e.amount_units as credited_units,e.wallet_ref as ledger_wallet_ref,
        e.source_ref as ledger_source_ref,e.source_type as ledger_source_type from platform_coin_lots l
    join platform_coin_wallets w on w.wallet_ref=l.wallet_ref
    join platform_coin_ledger_entries e on e.lot_ref=l.lot_ref and e.operation='credit'
    where w.account_id=? and l.coin_type='paid_coins' and l.source_type='verified_payment_capture'
    order by e.resulting_wallet_version asc limit 1`,
      )
      .get(accountId);
    if (!first) return { status: "awaiting_first_recharge" };
    const order = db
      .prepare(
        `select o.*, r.verification_result, r.provider_capture_ref,
    r.expected_paid_coin_units as receipt_units, r.canonical_state, r.provider_order_ref as receipt_provider_order,
    r.merchant_scope_digest, r.amount_minor as receipt_amount, r.currency as receipt_currency, r.currency_exponent as receipt_exponent
    from platform_payment_orders o join platform_payment_receipts r on r.receipt_ref=o.latest_receipt_ref
    and r.payment_order_ref=o.payment_order_ref where o.wallet_lot_ref=?`,
      )
      .get(first.lot_ref);
    // D1 dangling E9 (referral_origins.payment_order_ref ->
    // payment_orders): the payment_orders parent table was not migrated,
    // so the payment order row is absent. Absence is "unmigrated", not
    // "payment not closed": callers skip settlement instead of throwing
    // referral_payment_binding_invalid. A present order that is not
    // credited is still "awaiting_payment_close" (below).
    if (!order) return { status: "awaiting_payment_close", unmigrated: true };
    if (order.status !== "credited")
      return { status: "awaiting_payment_close" };
    const origin = db
      .prepare("select * from platform_coin_credit_origins where lot_ref=?")
      .get(first.lot_ref);
    if (
      order.account_id !== accountId ||
      order.wallet_operation_ref !== first.operation_ref ||
      origin?.operation_ref !== first.operation_ref ||
      origin.wallet_ref !== first.wallet_ref ||
      origin.coin_type !== first.coin_type ||
      origin.source_type !== first.source_type ||
      origin.source_ref !== first.source_ref ||
      origin.credit_origin_ref !== first.credit_origin_ref ||
      first.credited_units !== first.issued_units ||
      first.ledger_wallet_ref !== first.wallet_ref ||
      first.ledger_source_ref !== first.source_ref ||
      first.ledger_source_type !== first.source_type ||
      order.verification_result !== "verified" ||
      order.canonical_state !== "payment_succeeded" ||
      order.expected_paid_coin_units !== first.issued_units ||
      order.receipt_units !== first.issued_units ||
      order.provider_order_ref !== order.receipt_provider_order ||
      order.amount_minor !== order.receipt_amount ||
      order.currency !== order.receipt_currency ||
      order.currency_exponent !== order.receipt_exponent
    )
      throw referralError("referral_payment_binding_invalid");
    const identity = paymentSettlementIdentity(
      {
        orderRef: order.payment_order_ref,
        adapterKey: order.adapter_key,
        paymentMethod: order.payment_method,
        merchantBindingRef: order.merchant_binding_ref,
        amountMinor: order.amount_minor,
        currency: order.currency,
        currencyExponent: order.currency_exponent,
        expectedPaidCoinUnits: order.expected_paid_coin_units,
      },
      {
        merchantScopeDigest: order.merchant_scope_digest,
        providerOrderRef: order.provider_order_ref,
        providerCaptureRef: order.provider_capture_ref,
      },
    );
    if (
      identity.settlementRef !== first.source_ref ||
      identity.settlementDigest !== origin.source_digest
    )
      throw referralError("referral_payment_binding_invalid");
    return { first, order };
  }
  function accrue(accountId) {
    requireRef(accountId);
    if (!rewardsEnabled) return { status: "rewards_disabled" };
    return db
      .transaction(() => {
        // U-F4: phase fence, first statement.
        assertWritable(db);
        const existing = db
          .prepare(
            "select status from platform_referral_accruals where account_id=?",
          )
          .get(accountId);
        if (existing) return { status: existing.status, replayed: true };
        const verified = readFirstVerifiedRecharge(accountId);
        if (verified.status) return verified;
        const { first, order } = verified;
        const binding = db
          .prepare(
            "select * from platform_referral_bindings where account_id=?",
          )
          .get(accountId);
        const referrer =
          binding?.referrer_id && binding.registered_at <= first.created_at
            ? binding.referrer_id
            : null;
        const policy = policyAt(first.created_at);
        const eligible =
          referrer &&
          db
            .prepare(
              `select 1 from platform_referral_profiles p join platform_accounts a on a.id=p.account_id
        where p.account_id=? and p.status='active' and a.status='active'`,
            )
            .get(referrer);
        const amount =
          eligible && policy ? rewardUnits(first.issued_units, policy) : 0;
        const state = !eligible
          ? "excluded"
          : !policy
            ? "policy_missing"
            : amount
              ? "pending"
              : "excluded";
        const sourceRef = sourceRefFor(accountId);
        let lotRef = null;
        if (amount) {
          const credit = wallet.creditCoins({
            accountId: referrer,
            coinType: "reward_coins",
            amountUnits: amount,
            availability: "pending",
            sourceType: "portal_first_recharge_reward",
            sourceRef,
            sourceDigest: digest(
              JSON.stringify({ lot: first.lot_ref, policy, amount }),
            ),
            policyRef: policy.policyRef,
            policyVersion: policy.version,
            expiresAt: null,
            operation: {
              actorScope: "portal_referral",
              actorType: "referral_service",
              actorRef: "portal_referral",
              idempotencyKey: sourceRef,
            },
          });
          lotRef = credit.resultRef;
        }
        db.prepare(
          "insert into platform_referral_origins values(?,?,?,?,?,?,?,?)",
        ).run(
          accountId,
          first.lot_ref,
          order.payment_order_ref,
          referrer,
          first.issued_units,
          first.created_at,
          policy ? JSON.stringify(policy) : null,
          now(),
        );
        db.prepare(
          `insert into platform_referral_accruals
        (account_id,reward_units,reward_lot_ref,confirmation_at,status,updated_at) values(?,?,?,?,?,?)`,
        ).run(
          accountId,
          amount,
          lotRef,
          policy
            ? addDays(first.created_at, policy.confirmationDays)
            : first.created_at,
          state,
          now(),
        );
        event(sourceRef, accountId, "first_recharge", {
          lot: first.lot_ref,
          amount,
          policy,
        });
        return { status: state, replayed: false };
      })
      .immediate();
  }
  function releasePendingReward(row, eventRef, kind, basis = {}) {
    // U-F4: phase fence, first statement (covers the direct accrual
    // update below; the wallet confirm call is fenced by U-F1 as well).
    assertWritable(db);
    const amount = row.reward_units - row.reversed_units;
    if (amount)
      wallet.confirmCoinCredit({
        lotRef: row.reward_lot_ref,
        amountUnits: amount,
        operation: {
          actorScope: "portal_referral",
          actorType: "referral_service",
          actorRef: "portal_referral",
          idempotencyKey: `confirm_${sourceRefFor(row.account_id)}`,
        },
      });
    event(eventRef, row.account_id, kind, { amount, ...basis });
    db.prepare("update platform_referral_accruals set status='available',updated_at=? where account_id=?")
      .run(now(), row.account_id);
    return { status: "available" };
  }
  function hasInternalConfirmation(accountId) {
    return Boolean(db.prepare("select 1 from platform_referral_events where event_ref=? and account_id=? and kind='internal_ledger_confirmed'")
      .get(internalConfirmationRef(accountId), accountId));
  }
  function settleAccount(accountId) {
    return db.transaction(() => {
      // U-F4: phase fence, first statement.
      assertWritable(db);
      if (closed || !rewardsEnabled) throw referralError("referral_rewards_disabled");
      const row = db.prepare("select * from platform_referral_accruals where account_id=?").get(accountId);
      if (!row || row.status !== "pending" || row.confirmation_at > now())
        throw referralError("referral_not_confirmable");
      active(accountId);
      const origin = db.prepare("select * from platform_referral_origins where account_id=?").get(accountId);
      const verified = readFirstVerifiedRecharge(accountId);
      // D1 dangling E9: a payment order that was not migrated skips
      // settlement (status stays pending) instead of throwing
      // referral_payment_binding_invalid. A present-but-unclosed payment
      // still throws, as before.
      if (verified.unmigrated) {
        logDangling("referral_payment_order_unmigrated", { accountId });
        return { status: "pending_unmigrated", accountId };
      }
      if (!origin || verified.status) throw referralError("referral_payment_binding_invalid");
      const { first, order } = verified;
      const binding = db.prepare("select * from platform_referral_bindings where account_id=?").get(accountId);
      if (origin.lot_ref !== first.lot_ref || origin.payment_order_ref !== order.payment_order_ref
        || origin.paid_units !== first.issued_units || origin.credited_at !== first.created_at
        || !origin.referrer_id || origin.referrer_id === accountId
        || binding?.referrer_id !== origin.referrer_id || binding.registered_at > origin.credited_at)
        throw referralError("referral_payment_binding_invalid");
      active(origin.referrer_id);
      // D1 dangling E7/E8 (referral_bindings/origins.referrer_id ->
      // referral_profiles): the profiles parent table was not migrated,
      // so the referrer's profile row can be absent. Absence is
      // "unmigrated": skip settlement (status stays pending) instead of
      // throwing referral_account_ineligible. A present profile that is
      // not active still throws, as before.
      const referrerProfile = db.prepare("select status from platform_referral_profiles where account_id=?").get(origin.referrer_id);
      if (!referrerProfile) {
        logDangling("referral_profile_unmigrated", {
          accountId,
          referrerId: origin.referrer_id,
        });
        return { status: "pending_unmigrated", accountId };
      }
      if (referrerProfile.status !== "active")
        throw referralError("referral_account_ineligible");
      const policy = policySnapshot(JSON.parse(origin.policy_json));
      if (JSON.stringify(policyAt(origin.credited_at)) !== JSON.stringify(policy)
        || row.confirmation_at !== addDays(origin.credited_at, policy.confirmationDays)
        || row.reward_units !== rewardUnits(origin.paid_units, policy))
        throw referralError("referral_payment_binding_invalid");
      units(row.refunded_paid_units, origin.paid_units);
      units(row.reversed_units, row.reward_units);
      const expectedReversed = row.reward_units - rewardUnits(origin.paid_units - row.refunded_paid_units, policy);
      const remaining = row.reward_units - row.reversed_units;
      if (row.reversed_units !== expectedReversed || remaining <= 0)
        throw referralError("referral_not_confirmable");
      const lot = db.prepare("select l.*,w.account_id,w.status as wallet_status from platform_coin_lots l join platform_coin_wallets w using(wallet_ref) where l.lot_ref=?")
        .get(row.reward_lot_ref);
      const credit = db.prepare("select * from platform_coin_credit_origins where lot_ref=?").get(row.reward_lot_ref);
      const sourceDigest = digest(JSON.stringify({ lot: first.lot_ref, policy, amount: row.reward_units }));
      if (!lot || lot.account_id !== origin.referrer_id || lot.wallet_status !== "active"
        || lot.coin_type !== "reward_coins" || lot.source_type !== "portal_first_recharge_reward"
        || lot.source_ref !== sourceRefFor(accountId)
        || lot.policy_ref !== policy.policyRef || lot.policy_version !== policy.version || lot.expires_at !== null
        || lot.issued_units !== row.reward_units || lot.pending_units !== remaining
        || lot.reversed_units !== row.reversed_units || lot.available_units !== 0
        || lot.held_units !== 0 || lot.consumed_units !== 0 || lot.expired_units !== 0
        || credit?.wallet_ref !== lot.wallet_ref || credit.coin_type !== lot.coin_type
        || credit.source_type !== lot.source_type || credit.source_ref !== lot.source_ref
        || credit.credit_origin_ref !== lot.credit_origin_ref || credit.source_digest !== sourceDigest)
        throw referralError("referral_wallet_binding_invalid");
      const creditEntry = db.prepare("select * from platform_coin_ledger_entries where lot_ref=? and operation_ref=? and operation='credit'")
        .get(lot.lot_ref, credit.operation_ref);
      if (!creditEntry || creditEntry.wallet_ref !== lot.wallet_ref || creditEntry.amount_units !== row.reward_units
        || creditEntry.source_type !== lot.source_type || creditEntry.source_ref !== lot.source_ref)
        throw referralError("referral_wallet_binding_invalid");
      return releasePendingReward(row, internalConfirmationRef(accountId), "internal_ledger_confirmed", {
        basis: "verified_first_paid_credit_and_recorded_referral_ledger",
        paidLotRef: origin.lot_ref, paymentOrderRef: origin.payment_order_ref,
        policyRef: policy.policyRef, policyVersion: policy.version,
        refundedPaidUnits: row.refunded_paid_units, reversedRewardUnits: row.reversed_units,
      });
    }).immediate();
  }
  let settlementCursor = "";
  function settle({ limit = 100 } = {}) {
    if (closed) throw referralError();
    units(limit, 1000);
    if (!limit) throw referralError("referral_request_invalid");
    if (!rewardsEnabled) return [];
    const accounts = db.prepare("select account_id from platform_referral_accruals where status='pending' and confirmation_at<=? and account_id>? order by account_id limit ?")
      .all(now(), settlementCursor, limit);
    const statuses = accounts.map(({ account_id }) => {
      try { return settleAccount(account_id).status; }
      catch { return "settlement_blocked"; }
    });
    settlementCursor = accounts.length === limit ? accounts.at(-1).account_id : "";
    return statuses;
  }
  function confirm(accountId, decisionRef) {
    // U-F4: phase fence, first statement.
    assertWritable(db);
    if (!rewardsEnabled) throw referralError("referral_rewards_disabled");
    if (typeof riskReader !== "function")
      throw referralError("referral_risk_unavailable");
    requireRef(accountId);
    requireRef(decisionRef);
    const decision = riskReader(decisionRef);
    if (
      decision?.accountId !== accountId ||
      decision?.decisionRef !== decisionRef ||
      decision?.approved !== true ||
      decision?.refundObservationComplete !== true
    )
      throw referralError("referral_risk_rejected");
    return db
      .transaction(() => {
        const row = db
          .prepare(
            `select a.*,o.referrer_id from platform_referral_accruals a join platform_referral_origins o using(account_id) where account_id=?`,
          )
          .get(accountId);
        if (!row) throw referralError("referral_not_found");
        if (row.status === "available" || row.status === "reversed")
          return { status: row.status };
        if (row.status !== "pending" || row.confirmation_at > now())
          throw referralError("referral_not_confirmable");
        active(row.referrer_id);
        // D1 dangling E7/E8: see settleAccount — a missing referrer
        // profile is "unmigrated", not ineligible: confirm skips instead
        // of throwing referral_account_ineligible.
        const confirmProfile = db
          .prepare(
            "select status from platform_referral_profiles where account_id=?",
          )
          .get(row.referrer_id);
        if (!confirmProfile) {
          logDangling("referral_profile_unmigrated", {
            accountId,
            referrerId: row.referrer_id,
          });
          return { status: "pending_unmigrated", accountId };
        }
        if (confirmProfile.status !== "active")
          throw referralError("referral_account_ineligible");
        const result = releasePendingReward(row, decisionRef, "risk_approved");
        db.prepare("update platform_referral_accruals set risk_approved=1 where account_id=?").run(accountId);
        return result;
      })
      .immediate();
  }
  function applyRefund(observationRef) {
    // U-F4: phase fence, first statement.
    assertWritable(db);
    requireRef(observationRef);
    if (typeof refundReader !== "function")
      throw referralError("referral_refund_unavailable");
    const fact = refundReader(observationRef);
    if (
      fact?.verified !== true ||
      fact?.observationRef !== observationRef ||
      typeof fact.chargeback !== "boolean"
    )
      throw referralError("referral_refund_unverified");
    requireRef(fact.paymentOrderRef);
    units(fact.cumulativeRefundedPaidUnits);
    return db
      .transaction(() => {
        const row = db
          .prepare(
            `select a.*,o.payment_order_ref,o.paid_units,o.policy_json from platform_referral_accruals a
        join platform_referral_origins o using(account_id) where o.payment_order_ref=?`,
          )
          .get(fact.paymentOrderRef);
        if (!row) throw referralError("referral_not_found");
        units(fact.cumulativeRefundedPaidUnits, row.paid_units);
        const cumulative = Math.max(
          row.refunded_paid_units,
          fact.chargeback ? row.paid_units : fact.cumulativeRefundedPaidUnits,
        );
        event(observationRef, row.account_id, "refund", {
          order: fact.paymentOrderRef,
          units: fact.cumulativeRefundedPaidUnits,
          chargeback: fact.chargeback,
        });
        const policy = row.policy_json
          ? policySnapshot(JSON.parse(row.policy_json))
          : null;
        const target =
          policy && row.reward_units
            ? row.reward_units -
              rewardUnits(row.paid_units - cumulative, policy)
            : 0;
        // A prior admin clawback already reversed part of this reward and
        // recorded it on the accrual (see admin-user-commerce clawback), so
        // the remaining difference can be below the accrual's reversed
        // total. Clamp at zero: never pass a negative amount to
        // reverseReferralReward, and never move the accrual backwards.
        const difference = Math.max(0, target - row.reversed_units);
        const reversed =
          difference === 0 ||
          reverseReferralReward(db, {
            lotRef: row.reward_lot_ref,
            sourceRef: sourceRefFor(row.account_id),
            amount: difference,
            cumulative,
            occurredAt: now(),
          });
        const status = !reversed
          ? "reconciliation_required"
          : target === row.reward_units && row.reward_units > 0
            ? "reversed"
            : row.status === "reconciliation_required"
              ? row.risk_approved || hasInternalConfirmation(row.account_id)
                ? "available"
                : "pending"
              : row.status;
        db.prepare(
          "update platform_referral_accruals set refunded_paid_units=?,reversed_units=?,status=?,updated_at=? where account_id=?",
        ).run(
          cumulative,
          reversed ? Math.max(target, row.reversed_units) : row.reversed_units,
          status,
          now(),
          row.account_id,
        );
        return { status };
      })
      .immediate();
  }
  function performance(accountId) {
    active(accountId);
    // Read-only aggregation. No customer identifiers or payment amounts leave it.
    return db.transaction(() => {
      const registrations = db
        .prepare(
          "select count(*) as n from platform_referral_bindings where referrer_id=?",
        )
        .get(accountId).n;
      const rows = db
        .prepare(
          `select o.paid_units,a.*,l.pending_units,l.available_units from platform_referral_origins o
        join platform_referral_accruals a using(account_id) left join platform_coin_lots l on l.lot_ref=a.reward_lot_ref where o.referrer_id=?`,
        )
        .all(accountId);
      const sum = (field) =>
        rows.reduce((total, row) => units(total + units(row[field] ?? 0)), 0);
      return {
        registrations,
        firstRechargeConversions: rows.length,
        creditedFirstRechargeCoins: sum("paid_units"),
        pendingRewardCoins: sum("pending_units"),
        availableRewardCoins: sum("available_units"),
        reversedRewardCoins: sum("reversed_units"),
        conversionRate: registrations ? rows.length / registrations : 0,
        reconciliationRequired: rows.some((row) =>
          ["reconciliation_required", "policy_missing"].includes(row.status),
        ),
      };
    })();
  }
  let reconciliationCursor = "";
  function reconcile({ limit = 100 } = {}) {
    units(limit, 1000);
    if (!limit) throw referralError("referral_request_invalid");
    if (!rewardsEnabled) return [];
    const accounts = db
      .prepare(
        `select distinct w.account_id from platform_coin_wallets w
      join platform_coin_lots l on l.wallet_ref=w.wallet_ref
      left join platform_referral_origins o on o.account_id=w.account_id
      where o.account_id is null and w.account_id>? and l.coin_type='paid_coins' and l.source_type='verified_payment_capture'
      order by w.account_id limit ?`,
      )
      .all(reconciliationCursor, limit);
    const statuses = accounts.map(({ account_id }) => {
      try {
        return accrue(account_id).status;
      } catch {
        return "reconciliation_required";
      }
    });
    reconciliationCursor =
      accounts.length === limit ? accounts.at(-1).account_id : "";
    return statuses;
  }
  let timer = null,
    tickStopped = false,
    closed = false;
  // W-115 quiescence wiring (scheduler-quiescence wiring, 2026-11-23):
  // selective tick state for the freeze executor. `tickInFlight` is set
  // on tick entry and cleared on exit, including the exception path, and
  // `lastTickEndedAt` records when the latest tick finished. `stopTick()`
  // only clears the interval: it never touches the wallet or the database
  // connection and never sets `closed`, so `start()` can re-arm the tick
  // afterwards. Nothing here disarms the tick on its own; the freeze
  // executor calls `stopTick()` inside the freeze window.
  let tickInFlight = false,
    lastTickEndedAt = null,
    tickTimerClearedAt = null,
    tickWaiters = [];
  function clearTickTimer() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    tickTimerClearedAt ??= now();
  }
  // Stops only the tick and waits for the tick in flight at call time, if
  // any, before reporting the stop evidence. The tick body is synchronous
  // today, so in practice this wait only triggers if `stopTick()` is called
  // re-entrantly from inside a tick or if the tick body later becomes
  // asynchronous; the wait is kept so the contract holds in both cases.
  // Never call `stopTick()` from inside a tick: the tick cannot finish
  // until this wait resolves.
  async function stopTick() {
    clearTickTimer();
    tickStopped = true;
    if (tickTimerClearedAt === null) tickTimerClearedAt = now();
    if (tickInFlight) {
      await new Promise((resolve) => {
        tickWaiters.push(resolve);
      });
    }
    return Object.freeze({
      timerClearedAt: tickTimerClearedAt,
      lastTickEndedAt,
      tickInFlight: false,
    });
  }
  // Read-only tick status for the freeze executor's pre-stop reading and
  // post-stop check. `timerArmed` is a direct read; `tickInFlight` is the
  // process-internal flag set by the tick body itself.
  function getTickStatus() {
    return Object.freeze({
      timerArmed: timer !== null,
      tickInFlight,
      lastTickEndedAt,
    });
  }
  function start() {
    if (closed) throw referralError();
    if (!rewardsEnabled) return;
    if (timer) return;
    // Facts stay in payment/wallet storage until processed. The cursor advances
    // even when one account is blocked, and wraps for durable retry after restart.
    const tick = () => {
      if (closed || !rewardsEnabled) return;
      tickInFlight = true;
      try {
        try {
          reconcile();
        } catch {
          /* retry on next bounded tick */
        }
        try {
          settle();
        } catch {
          /* retry internal ledger settlement on the next bounded tick */
        }
      } finally {
        tickInFlight = false;
        try {
          lastTickEndedAt = now();
        } catch {
          // A broken clock must not wedge a stopTick() waiter: keep the
          // previous lastTickEndedAt and still release the waiters.
        }
        const waiters = tickWaiters;
        tickWaiters = [];
        for (const resolve of waiters) resolve();
      }
    };
    tick();
    timer = setInterval(tick, 30000);
    timer.unref();
    tickStopped = false;
  }
  // tickState() is the D3-A evidence for the scheduler-drain receipt
  // ("tick timer cleared and no tick in flight"). Stopping the tick does
  // NOT close the service or the database: reads stay available and
  // start() can restart the tick afterwards.
  function tickState() {
    return Object.freeze({
      jobId: "W-115",
      running: timer !== null,
      stopped: tickStopped,
      rewardsEnabled,
    });
  }
  return {
    start,
    stopTick,
    getTickStatus,
    tickState,
    profile,
    createLink,
    capture,
    accrue,
    reconcile,
    settle,
    confirm,
    applyRefund,
    performance,
    publishPolicy,
    close() {
      if (closed) return;
      closed = true;
      clearTickTimer();
      wallet.close();
      if (owned) db.close();
    },
  };
}
