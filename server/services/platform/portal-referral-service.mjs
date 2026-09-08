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

const addDays = (date, days) =>
  timestamp(new Date(Date.parse(date) + days * 86400000));
const sourceRefFor = (account) =>
  `referral_origin_${digest(account).slice(0, 32)}`;
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
  function accrue(accountId) {
    requireRef(accountId);
    if (!rewardsEnabled) return { status: "rewards_disabled" };
    return db
      .transaction(() => {
        const existing = db
          .prepare(
            "select status from platform_referral_accruals where account_id=?",
          )
          .get(accountId);
        if (existing) return { status: existing.status, replayed: true };
        // Wallet versions are per-account monotonically increasing durable credit
        // sequence. Consider unclosed credits too; never skip one for a later order.
        const first = db
          .prepare(
            `select l.*, e.operation_ref, e.resulting_wallet_version from platform_coin_lots l
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
        if (!order || order.status !== "credited")
          return { status: "awaiting_payment_close" };
        const origin = db
          .prepare("select * from platform_coin_credit_origins where lot_ref=?")
          .get(first.lot_ref);
        if (
          order.account_id !== accountId ||
          order.wallet_operation_ref !== first.operation_ref ||
          origin?.operation_ref !== first.operation_ref ||
          origin.source_ref !== first.source_ref ||
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
  function confirm(accountId, decisionRef) {
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
        if (
          db
            .prepare(
              "select status from platform_referral_profiles where account_id=?",
            )
            .get(row.referrer_id)?.status !== "active"
        )
          throw referralError("referral_account_ineligible");
        const amount = row.reward_units - row.reversed_units;
        if (amount)
          wallet.confirmCoinCredit({
            lotRef: row.reward_lot_ref,
            amountUnits: amount,
            operation: {
              actorScope: "portal_referral",
              actorType: "referral_service",
              actorRef: "portal_referral",
              idempotencyKey: `confirm_${sourceRefFor(accountId)}`,
            },
          });
        event(decisionRef, accountId, "risk_approved", { amount });
        db.prepare(
          "update platform_referral_accruals set status='available',risk_approved=1,updated_at=? where account_id=?",
        ).run(now(), accountId);
        return { status: "available" };
      })
      .immediate();
  }
  function applyRefund(observationRef) {
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
        const difference = target - row.reversed_units;
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
              ? row.risk_approved
                ? "available"
                : "pending"
              : row.status;
        db.prepare(
          "update platform_referral_accruals set refunded_paid_units=?,reversed_units=?,status=?,updated_at=? where account_id=?",
        ).run(
          cumulative,
          reversed ? target : row.reversed_units,
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
    closed = false;
  function start() {
    if (closed) throw referralError();
    if (!rewardsEnabled) return;
    if (timer) return;
    // Facts stay in payment/wallet storage until processed. The cursor advances
    // even when one account is blocked, and wraps for durable retry after restart.
    const tick = () => {
      try {
        reconcile();
      } catch {
        /* retry on next bounded tick */
      }
    };
    tick();
    timer = setInterval(tick, 30000);
    timer.unref();
  }
  return {
    start,
    profile,
    createLink,
    capture,
    accrue,
    reconcile,
    confirm,
    applyRefund,
    performance,
    publishPolicy,
    close() {
      if (closed) return;
      closed = true;
      if (timer) clearInterval(timer);
      wallet.close();
      if (owned) db.close();
    },
  };
}
