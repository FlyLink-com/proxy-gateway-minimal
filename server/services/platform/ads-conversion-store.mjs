// Google Ads server-side conversion measurement (PR-1: click claim +
// binding + terminal-state outbox only; the dispatcher is a later change).
//
// The portal may attach an optional `adsClick` descriptor to a purchase
// confirmation. The purchase stores never write measurement data inside a
// purchase transaction. Instead, after a purchase request commits, the
// calling layer runs a post-commit step through the `safe*` entry points
// below:
//
//   - First (non-replay) request: `safeCaptureAdsClickForOrder` records the
//     request's normalized click claim (first claim wins per order) and
//     materializes the click binding from that claim.
//   - Replay of the same idempotency key: `safeMaterializeAdsClickForOrder`
//     materializes the binding from the stored claim only. A replay can
//     never introduce a click the first request did not declare, and a
//     click the first request declared is not lost just because the first
//     materialization did not happen.
//   - Terminal purchase state (legacy fulfillment delivered / deferred
//     transition settled): `safeEnqueueAdsConversion` materializes once
//     more from the claim, then writes exactly one outbox row per order.
//
// Master switch: ADS_CLICK_BINDING_ENABLED (default off). While off, every
// entry point in this module is a no-op that performs no database writes,
// so purchase flows keep their exact previous behavior, including not
// creating the tables below. The `safe*` entry points never throw: a
// measurement failure (lock, schema error, anything) returns null and can
// never change a purchase outcome.
//
// Privacy: click values are sensitive measurement identifiers. They are
// stored only in the ads tables, are never written to logs or order event
// streams, and diagnostics expose counts/status only.

import { bindAdsClickConsentClaim, hasAdsClickConsentClaim, hasAdsConsentForAccount } from "./ads-consent-store.mjs";

const CLICK_TYPES = new Set(["gclid", "gbraid", "wbraid"]);
const CLICK_VALUE_PATTERN = /^[A-Za-z0-9_.-]{1,512}$/;
const MAX_CLICK_AGE_MS = 90 * 24 * 60 * 60 * 1000;
// clickAt is accepted in exactly two shapes (see parseClickAt). The epoch
// form must be a millisecond quantity: anything below 1e11 ms predates
// 1973 and is treated as a seconds quantity that was passed by mistake.
const MIN_EPOCH_MS = 100_000_000_000;
const CLICK_AT_ISO_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MODELS = new Set(["legacy", "deferred"]);
// Same safe-reference shape the attribution binding module enforces for
// order and account references.
const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;

export function adsBindingEnabled(env = process.env) {
  const value = env?.ADS_CLICK_BINDING_ENABLED;
  return value === true || value === "true";
}

export function ensureAdsConversionSchema(db) {
  db.exec(`
    create table if not exists platform_ads_click_claims (
      order_ref text primary key,
      account_ref text not null,
      model text not null,
      claim_state text not null,
      click_type text,
      click_value text,
      click_at integer,
      consent_ad_user_data integer,
      consent_ad_personalization integer,
      created_at integer not null,
      updated_at integer not null,
      check (claim_state in ('click', 'no_click', 'invalid_click')),
      check (
        (claim_state = 'click' and click_type is not null and click_value is not null
          and click_at is not null and consent_ad_user_data is not null
          and consent_ad_personalization is not null)
        or (claim_state != 'click' and click_type is null and click_value is null
          and click_at is null and consent_ad_user_data is null
          and consent_ad_personalization is null)
      )
    );

    create table if not exists platform_ads_click_bindings (
      order_ref text primary key,
      account_ref text not null,
      model text not null,
      click_type text not null,
      click_value text not null,
      click_at integer not null,
      consent_ad_user_data integer not null,
      consent_ad_personalization integer not null,
      created_at integer not null,
      updated_at integer not null
    );

    create table if not exists platform_ads_conversion_outbox (
      order_ref text primary key,
      model text not null,
      transaction_id text not null,
      value_units integer not null,
      value_unit text not null default 'COIN',
      terminal_at integer not null,
      status text not null,
      skip_reason text,
      attempts integer not null default 0,
      next_attempt_at integer,
      last_error text,
      google_request_id text,
      created_at integer not null,
      updated_at integer not null
    );
  `);
}

function isPlainObject(value) {
  return (
    value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
  );
}

function normalizeNow(now) {
  return Number.isSafeInteger(now) && now >= 0 ? now : Date.now();
}

function safeRef(value) {
  return typeof value === "string" && SAFE_REF_PATTERN.test(value)
    ? value
    : null;
}

// clickAt is accepted in exactly two shapes:
//   - a millisecond epoch integer (seconds quantities are rejected), or
//   - a complete UTC ISO string with millisecond precision and a `Z`
//     suffix (the shape Date#toISOString produces).
// Timezone-less strings, incomplete dates, and every other shape return
// null instead of being guessed in the process timezone. The ISO form is
// also round-trip checked: strings that merely look calendrical but are
// not real dates (February 30, hour 24) are normalized by Date.parse
// instead of rejected, so the parsed value must reproduce the input
// exactly through toISOString.
function parseClickAt(value) {
  if (Number.isSafeInteger(value)) {
    return value >= MIN_EPOCH_MS ? value : null;
  }
  if (typeof value === "string" && CLICK_AT_ISO_UTC_PATTERN.test(value)) {
    const parsed = Date.parse(value);
    if (!Number.isSafeInteger(parsed)) return null;
    return new Date(parsed).toISOString() === value ? parsed : null;
  }
  return null;
}

// Pure validation of the client-supplied adsClick descriptor. Returns a
// frozen normalized object ({ type, value, clickAt, consent }) or null for
// any malformed, future, or expired input. A null result means only "not
// a valid click": whether the request carried no descriptor at all
// (no_click) or an unusable one (invalid_click) is decided by the caller
// from the descriptor's presence, never from this result alone. It never
// rejects the surrounding purchase.
export function validateAdsClick(input, now = Date.now()) {
  const at = normalizeNow(now);
  if (!isPlainObject(input)) return null;
  if (!CLICK_TYPES.has(input.type)) return null;
  if (typeof input.value !== "string" || !CLICK_VALUE_PATTERN.test(input.value)) {
    return null;
  }
  const clickAt = parseClickAt(input.clickAt);
  if (clickAt === null || clickAt > at || clickAt < at - MAX_CLICK_AGE_MS) {
    return null;
  }
  if (!isPlainObject(input.consent)) return null;
  if (
    input.consent.adUserData !== true
    || input.consent.adPersonalization !== false
  ) {
    return null;
  }
  return Object.freeze({
    type: input.type,
    value: input.value,
    clickAt,
    consent: Object.freeze({
      adUserData: input.consent.adUserData,
      adPersonalization: input.consent.adPersonalization
    })
  });
}

function mapClaim(row) {
  if (!row) return null;
  const claimState = row.claim_state;
  const hasClick = claimState === "click";
  return {
    orderRef: row.order_ref,
    accountRef: row.account_ref,
    model: row.model,
    claimState,
    // Derived convenience for existing consumers: true only for a
    // validated click claim.
    hasClick,
    clickType: hasClick ? row.click_type : null,
    clickValue: hasClick ? row.click_value : null,
    clickAt: hasClick ? row.click_at : null,
    consentAdUserData: hasClick ? row.consent_ad_user_data === 1 : null,
    consentAdPersonalization: hasClick
      ? row.consent_ad_personalization === 1
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function getAdsClickClaim(db, orderRef) {
  const ref = safeRef(orderRef);
  if (!ref) return null;
  ensureAdsConversionSchema(db);
  return mapClaim(db.prepare(`
    select * from platform_ads_click_claims where order_ref = ?
  `).get(ref));
}

// Records the first purchase request's click claim for an order. The
// claim is tri-state, because "no click" must only ever mean the request
// demonstrably carried none:
//   - 'click':         the request carried a descriptor that validated;
//                      its normalized fields are stored.
//   - 'no_click':      the request carried no adsClick descriptor at all.
//   - 'invalid_click': the request carried a descriptor that failed
//                      validation (bad type, bad value, non-boolean
//                      consent, unusable clickAt, ...). Nothing about the
//                      descriptor is stored, but the outcome is kept
//                      distinct from 'no_click' so malformed measurement
//                      never pollutes the no-click statistics.
// The first claim wins: later writes for the same order (including
// idempotent replays, which must not call this at all) leave the stored
// claim unchanged. Returns the stored claim, or null when disabled or
// the references are invalid.
export function recordAdsClickClaim(db, input = {}, options = {}) {
  const env = options.env ?? process.env;
  if (!adsBindingEnabled(env)) return null;
  const orderRef = safeRef(input.orderRef);
  const accountRef = safeRef(input.accountRef);
  if (!orderRef || !accountRef || !MODELS.has(input.model)) return null;
  const at = normalizeNow(options.now);
  let claimState = "no_click";
  let click = null;
  if (input.adsClick !== undefined) {
    const submittedClick = validateAdsClick(input.adsClick, at);
    if (submittedClick && hasAdsConsentForAccount(db, accountRef)) {
      click = submittedClick;
      claimState = "click";
    } else {
      // A client descriptor is never consent evidence. Unknown or denied
      // server consent records only a value-free invalid claim.
      claimState = "invalid_click";
    }
  }
  ensureAdsConversionSchema(db);
  const transaction = db.transaction(() => {
    const inserted = db.prepare(`
      insert into platform_ads_click_claims (
        order_ref, account_ref, model, claim_state, click_type, click_value,
        click_at, consent_ad_user_data, consent_ad_personalization,
        created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(order_ref) do nothing
    `).run(
      orderRef,
      accountRef,
      input.model,
      claimState,
      click?.type ?? null,
      click?.value ?? null,
      click?.clickAt ?? null,
      click ? 1 : null,
      click ? 0 : null,
      at,
      at
    );
    if (inserted.changes === 1 && click) {
      bindAdsClickConsentClaim(db, {
        orderRef,
        accountRef,
        createdAt: at
      });
    }
    return getAdsClickClaim(db, orderRef);
  });
  return transaction.immediate();
}

function mapBinding(row) {
  if (!row) return null;
  return {
    orderRef: row.order_ref,
    accountRef: row.account_ref,
    model: row.model,
    clickType: row.click_type,
    clickValue: row.click_value,
    clickAt: row.click_at,
    consentAdUserData: row.consent_ad_user_data === 1,
    consentAdPersonalization: row.consent_ad_personalization === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function getAdsClickBinding(db, orderRef) {
  const ref = safeRef(orderRef);
  if (!ref) return null;
  ensureAdsConversionSchema(db);
  return mapBinding(db.prepare(`
    select * from platform_ads_click_bindings where order_ref = ?
  `).get(ref));
}

// Materializes the click binding from the stored claim. This is the only
// way a binding row is created: a binding always reflects the first
// request's claim, never a descriptor carried by a later replay. Only a
// 'click' claim materializes; 'no_click' and 'invalid_click' claims never
// produce a binding. Idempotent; returns the stored binding, or null when
// disabled, when no claim exists, or when the claim carries no valid
// click.
export function materializeAdsClickBinding(db, input = {}, options = {}) {
  const env = options.env ?? process.env;
  if (!adsBindingEnabled(env)) return null;
  const orderRef = safeRef(input.orderRef);
  if (!orderRef) return null;
  const at = normalizeNow(options.now);
  ensureAdsConversionSchema(db);
  const claim = getAdsClickClaim(db, orderRef);
  if (!claim || claim.claimState !== "click") return getAdsClickBinding(db, orderRef);
  if (!hasAdsClickConsentClaim(db, orderRef, claim.accountRef)) {
    return getAdsClickBinding(db, orderRef);
  }
  db.prepare(`
    insert into platform_ads_click_bindings (
      order_ref, account_ref, model, click_type, click_value, click_at,
      consent_ad_user_data, consent_ad_personalization, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(order_ref) do nothing
  `).run(
    claim.orderRef,
    claim.accountRef,
    claim.model,
    claim.clickType,
    claim.clickValue,
    claim.clickAt,
    claim.consentAdUserData ? 1 : 0,
    claim.consentAdPersonalization ? 1 : 0,
    at,
    at
  );
  return getAdsClickBinding(db, orderRef);
}

function mapOutboxRow(row) {
  if (!row) return null;
  return {
    orderRef: row.order_ref,
    model: row.model,
    transactionId: row.transaction_id,
    valueUnits: row.value_units,
    valueUnit: row.value_unit,
    terminalAt: row.terminal_at,
    status: row.status,
    skipReason: row.skip_reason,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
    googleRequestId: row.google_request_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function getAdsConversionOutboxRow(db, orderRef) {
  const ref = safeRef(orderRef);
  if (!ref) return null;
  ensureAdsConversionSchema(db);
  return mapOutboxRow(db.prepare(`
    select * from platform_ads_conversion_outbox where order_ref = ?
  `).get(ref));
}

// Records the terminal outcome of a purchase for later upload. Exactly one
// row per order. The outcome is classified from the stored claim, not just
// the binding, so that "unknown" is never recorded as a definite fact:
//   - no claim row at all: skipped / claim_missing (the first request's
//     declaration was never recorded; whether it carried a click is
//     unknown and must not be reported as "no click");
//   - claim 'no_click': skipped / no_click (the first request carried no
//     adsClick descriptor at all);
//   - claim 'invalid_click': skipped / invalid_click (the first request
//     carried a descriptor that failed validation — a definite fact
//     about the request, but not a usable click and not "no click");
//   - claim 'click' but no binding: skipped / binding_failed (the
//     click is known to exist but its binding never materialized —
//     measurement pending recovery, not a missing click);
//   - binding present but ad-user-data consent absent: skipped /
//     consent_denied;
//   - binding present and consented: pending.
// A row that was recorded as skipped is upgraded in place when a later
// evaluation computes pending (status becomes pending, skip_reason
// cleared); rows already pending or beyond are never downgraded or
// rewritten. Amounts are wallet Coins: value_units stores the Coins
// integer and value_unit names the unit ('COIN'); converting Coins to a
// conversion currency amount is the dispatcher's concern (PR-3), not this
// table's. Returns the stored row, or null when disabled or inputs are
// invalid.
export function enqueueAdsConversion(db, input = {}, options = {}) {
  const env = options.env ?? process.env;
  if (!adsBindingEnabled(env)) return null;
  const orderRef = safeRef(input.orderRef);
  if (!orderRef || !MODELS.has(input.model)) return null;
  if (!Number.isSafeInteger(input.valueUnits) || input.valueUnits < 1) {
    return null;
  }
  const at = normalizeNow(options.now);
  const terminalAt = Number.isSafeInteger(input.terminalAt) && input.terminalAt > 0
    ? input.terminalAt
    : at;
  ensureAdsConversionSchema(db);
  const claim = getAdsClickClaim(db, orderRef);
  const binding = getAdsClickBinding(db, orderRef);
  let status = "pending";
  let skipReason = null;
  if (!claim) {
    status = "skipped";
    skipReason = "claim_missing";
  } else if (claim.claimState === "no_click") {
    status = "skipped";
    skipReason = "no_click";
  } else if (claim.claimState === "invalid_click") {
    status = "skipped";
    skipReason = "invalid_click";
  } else if (!binding && !hasAdsConsentForAccount(db, claim.accountRef)) {
    status = "skipped";
    skipReason = "consent_revoked";
  } else if (!binding) {
    status = "skipped";
    skipReason = "binding_failed";
  } else if (!binding.consentAdUserData) {
    status = "skipped";
    skipReason = "consent_denied";
  }
  db.prepare(`
    insert into platform_ads_conversion_outbox (
      order_ref, model, transaction_id, value_units, value_unit, terminal_at,
      status, skip_reason, attempts, next_attempt_at, last_error,
      google_request_id, created_at, updated_at
    ) values (?, ?, ?, ?, 'COIN', ?, ?, ?, 0, null, null, null, ?, ?)
    on conflict(order_ref) do update set
      status = case
        when excluded.status = 'pending' then 'pending'
        else platform_ads_conversion_outbox.status
      end,
      skip_reason = case
        when excluded.status = 'pending' then null
        else excluded.skip_reason
      end,
      value_units = case
        when excluded.status = 'pending' then excluded.value_units
        else platform_ads_conversion_outbox.value_units
      end,
      terminal_at = case
        when excluded.status = 'pending' then excluded.terminal_at
        else platform_ads_conversion_outbox.terminal_at
      end,
      updated_at = excluded.updated_at
    where platform_ads_conversion_outbox.status = 'skipped'
  `).run(
    orderRef,
    input.model,
    orderRef,
    input.valueUnits,
    terminalAt,
    status,
    skipReason,
    at,
    at
  );
  return getAdsConversionOutboxRow(db, orderRef);
}

// --- Post-commit safe entry points -------------------------------------
// The purchase stores call only these wrappers, always after the purchase
// transaction has committed. Each wrapper checks the master switch first
// (off means no schema creation and no writes at all) and swallows every
// error: measurement can never change a purchase outcome.

// First-request step: record this request's claim, then materialize the
// binding from the stored claim.
export function safeCaptureAdsClickForOrder(db, input = {}, options = {}) {
  const env = options.env ?? process.env;
  if (!adsBindingEnabled(env)) return null;
  try {
    recordAdsClickClaim(db, input, options);
    return materializeAdsClickBinding(db, { orderRef: input.orderRef }, options);
  } catch {
    return null;
  }
}

// Replay / recovery step: materialize the binding from the stored claim
// only. The current request's own descriptor is never consulted.
export function safeMaterializeAdsClickForOrder(db, input = {}, options = {}) {
  const env = options.env ?? process.env;
  if (!adsBindingEnabled(env)) return null;
  try {
    return materializeAdsClickBinding(db, { orderRef: input.orderRef }, options);
  } catch {
    return null;
  }
}

// Terminal-state step: give the binding a last chance to materialize from
// the claim, then record the outbox row. The two steps fail independently:
// if materialization throws (for example the bindings table is locked),
// the enqueue must still run so it can record the recoverable
// skipped / binding_failed outcome from the stored claim; if the enqueue
// itself throws, the failure is swallowed as before.
export function safeEnqueueAdsConversion(db, input = {}, options = {}) {
  const env = options.env ?? process.env;
  if (!adsBindingEnabled(env)) return null;
  try {
    materializeAdsClickBinding(db, { orderRef: input.orderRef }, options);
  } catch {
    // Materialization failed: fall through to the enqueue, which
    // classifies the outcome from the claim and the (absent) binding.
  }
  try {
    return enqueueAdsConversion(db, input, options);
  } catch {
    return null;
  }
}
