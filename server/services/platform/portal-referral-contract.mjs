import { createHash } from "node:crypto";
import { types } from "node:util";

export const REFERRAL_CODE = /^[A-Za-z0-9_-]{32}$/;
export const REFERRAL_COOKIE = "__Host-PortalReferral";
export function referralError(code = "referral_unavailable") {
  return Object.assign(new Error(code), { code });
}
export function requireRef(value) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_:-]{0,127}$/.test(value)
  ) {
    throw referralError("referral_request_invalid");
  }
  return value;
}
export function timestamp(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime()))
    throw referralError("referral_request_invalid");
  return d.toISOString();
}
export function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
export function units(value, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max)
    throw referralError("referral_request_invalid");
  return value;
}
export function policySnapshot(input) {
  const fields = [
    "policyRef",
    "version",
    "effectiveAt",
    "rateBps",
    "rounding",
    "attributionDays",
    "confirmationDays",
  ];
  if (
    !input ||
    types.isProxy(input) ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Reflect.ownKeys(input).length !== fields.length ||
    fields.some((f) => {
      const d = Object.getOwnPropertyDescriptor(input, f);
      return !d || !d.enumerable || !Object.hasOwn(d, "value");
    })
  ) {
    throw referralError("referral_policy_invalid");
  }
  const policy = {
    policyRef: requireRef(input.policyRef),
    version: units(input.version),
    effectiveAt: timestamp(input.effectiveAt),
    rateBps: units(input.rateBps, 10000),
    rounding: input.rounding,
    attributionDays: units(input.attributionDays, 365),
    confirmationDays: units(input.confirmationDays, 365),
  };
  if (
    !policy.version ||
    !policy.rateBps ||
    !policy.attributionDays ||
    !["floor", "half_up"].includes(policy.rounding)
  )
    throw referralError("referral_policy_invalid");
  return Object.freeze(policy);
}
export function rewardUnits(basis, policy) {
  const n = BigInt(units(basis)) * BigInt(policy.rateBps);
  return units(
    Number((n + (policy.rounding === "half_up" ? 5000n : 0n)) / 10000n),
  );
}

// Called only inside the account store's existing registration transaction.
// The opaque cookie is trusted only after a digest lookup, never as an account id.
export function recordReferralRegistration(
  db,
  { accountId, token, registeredAt },
) {
  if (db.inTransaction !== true)
    throw referralError("referral_transaction_required");
  requireRef(accountId);
  const now = timestamp(registeredAt);
  const existing = db
    .prepare("select * from platform_referral_bindings where account_id = ?")
    .get(accountId);
  if (existing) return; // A replay never reassigns an account, including unattributed accounts.
  let touch;
  if (typeof token === "string" && REFERRAL_CODE.test(token)) {
    touch = db
      .prepare(
        `select t.* from platform_referral_touches t
      join platform_referral_profiles p on p.account_id = t.referrer_id
      join platform_accounts a on a.id = p.account_id
      where t.token_digest = ? and t.observed_at <= ? and t.expires_at > ?
      and p.status = 'active' and a.status = 'active'`,
      )
      .get(digest(token), now, now);
  }
  const referrer =
    touch && touch.referrer_id !== accountId ? touch.referrer_id : null;
  db.prepare(
    `insert into platform_referral_bindings
    (account_id, referrer_id, touch_digest, registered_at) values (?, ?, ?, ?)`,
  ).run(accountId, referrer, referrer ? touch.token_digest : null, now);
}
