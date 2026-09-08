import { randomUUID } from "node:crypto";
import { digest, referralError, units } from "./portal-referral-contract.mjs";

// Wallet-owned operation: caller holds the same SQLite IMMEDIATE transaction.
// Never reinterpret a reversal as consumption or expiration.
export function reverseReferralReward(
  database,
  { lotRef, sourceRef, amount, cumulative, occurredAt },
) {
  if (!database.inTransaction)
    throw referralError("referral_transaction_required");
  units(amount);
  units(cumulative);
  if (!amount) return true;
  const lot = database
    .prepare("select * from platform_coin_lots where lot_ref=?")
    .get(lotRef);
  if (
    !lot ||
    lot.coin_type !== "reward_coins" ||
    lot.source_type !== "portal_first_recharge_reward" ||
    lot.source_ref !== sourceRef
  )
    throw referralError("referral_wallet_binding_invalid");
  const wallet = database
    .prepare("select * from platform_coin_wallets where wallet_ref=?")
    .get(lot.wallet_ref);
  if (!wallet || !["active", "frozen"].includes(wallet.status))
    throw referralError("referral_wallet_binding_invalid");
  if (amount > lot.pending_units + lot.available_units) return false;
  const pending = Math.min(amount, lot.pending_units),
    available = amount - pending;
  const before = units(wallet.version),
    after = units(before + 1);
  const operationRef = `operation_${randomUUID()}`;
  const key = digest(`${sourceRef}:${cumulative}`);
  database
    .prepare(
      `insert into platform_coin_operation_receipts
    (operation_ref,wallet_ref,actor_scope,operation_type,idempotency_key,request_digest,status,
     previous_wallet_version,resulting_wallet_version,resulting_wallet_status,result_ref,safe_result_code,created_at,completed_at)
    values(?,?,'portal_referral','reverse_referral_reward',?,?,'succeeded',?,?,?,?, 'referral_reward_reversed',?,?)`,
    )
    .run(
      operationRef,
      wallet.wallet_ref,
      key,
      digest(`${key}:${amount}`),
      before,
      after,
      wallet.status,
      lotRef,
      occurredAt,
      occurredAt,
    );
  database
    .prepare(
      `update platform_coin_lots set pending_units=pending_units-?,available_units=available_units-?,
    reversed_units=reversed_units+?,updated_at=? where lot_ref=?`,
    )
    .run(pending, available, amount, occurredAt, lotRef);
  database
    .prepare(
      "update platform_coin_wallets set version=?,updated_at=? where wallet_ref=?",
    )
    .run(after, occurredAt, wallet.wallet_ref);
  for (const [kind, part] of [
    ["pending_to_reversed", pending],
    ["available_to_reversed", available],
  ]) {
    if (!part) continue;
    database
      .prepare(
        `insert into platform_coin_ledger_entries
      (entry_ref,operation_ref,wallet_ref,lot_ref,operation,amount_units,hold_ref,order_ref,source_type,
       source_ref,actor_type,actor_ref,previous_wallet_version,resulting_wallet_version,resulting_wallet_status,occurred_at)
      values(?,?,?,?,?,?,null,null,'portal_referral_reversal',?,'referral_service','portal_referral',?,?,?,?)`,
      )
      .run(
        `ledger_entry_${randomUUID()}`,
        operationRef,
        wallet.wallet_ref,
        lotRef,
        kind,
        part,
        sourceRef,
        before,
        after,
        wallet.status,
        occurredAt,
      );
  }
  return true;
}
