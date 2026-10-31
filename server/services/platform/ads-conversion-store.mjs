// Google Ads server-side conversion measurement (PR-1: click binding +
// terminal-state outbox only; the dispatcher is a later change).
//
// The portal may attach an optional `adsClick` descriptor to a purchase
// confirmation. When the master switch is on, the descriptor is validated
// and bound to the created order, and reaching a terminal purchase state
// (legacy fulfillment delivered / deferred transition settled) enqueues
// exactly one outbox row per order for the future Data Manager uploader.
//
// Master switch: ADS_CLICK_BINDING_ENABLED (default off). While off, every
// entry point in this module is a no-op that performs no database writes,
// so purchase flows keep their exact previous behavior, including not
// creating the tables below.
//
// Privacy: click values are sensitive measurement identifiers. They are
// stored only in platform_ads_click_bindings, are never written to logs or
// order event streams, and diagnostics expose counts/status only.

const CLICK_TYPES = new Set(["gclid", "gbraid", "wbraid"]);
const CLICK_VALUE_PATTERN = /^[A-Za-z0-9_.-]{1,512}$/;
const MAX_CLICK_AGE_MS = 90 * 24 * 60 * 60 * 1000;
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
      currency text not null default 'CNY',
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

function parseClickAt(value) {
  if (Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const parsed = Date.parse(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

// Pure validation of the client-supplied adsClick descriptor. Returns a
// frozen normalized object ({ type, value, clickAt, consent }) or null for
// any malformed, future, or expired input. Callers must treat null as
// "ignore the field"; it never rejects the surrounding purchase.
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
    typeof input.consent.adUserData !== "boolean"
    || typeof input.consent.adPersonalization !== "boolean"
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

// Binds a validated click descriptor to a freshly created order. The first
// binding for an order wins: repeat submissions (idempotent confirm
// retries) leave the stored row unchanged. Returns the stored binding, or
// null when disabled or when any input is invalid.
export function bindAdsClick(db, input = {}, options = {}) {
  const env = options.env ?? process.env;
  if (!adsBindingEnabled(env)) return null;
  const orderRef = safeRef(input.orderRef);
  const accountRef = safeRef(input.accountRef);
  if (!orderRef || !accountRef || !MODELS.has(input.model)) return null;
  const at = normalizeNow(options.now);
  const click = validateAdsClick(input.adsClick, at);
  if (!click) return null;
  ensureAdsConversionSchema(db);
  db.prepare(`
    insert into platform_ads_click_bindings (
      order_ref, account_ref, model, click_type, click_value, click_at,
      consent_ad_user_data, consent_ad_personalization, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(order_ref) do nothing
  `).run(
    orderRef,
    accountRef,
    input.model,
    click.type,
    click.value,
    click.clickAt,
    click.consent.adUserData ? 1 : 0,
    click.consent.adPersonalization ? 1 : 0,
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
    currency: row.currency,
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
// row per order: repeat terminal signals leave the first row unchanged.
// Orders without a click binding, or whose binding lacks ad-user-data
// consent, are still recorded as skipped so coverage can be measured.
// Returns the stored row, or null when disabled or inputs are invalid.
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
  const binding = getAdsClickBinding(db, orderRef);
  let status = "pending";
  let skipReason = null;
  if (!binding) {
    status = "skipped";
    skipReason = "no_click";
  } else if (!binding.consentAdUserData) {
    status = "skipped";
    skipReason = "consent_denied";
  }
  db.prepare(`
    insert into platform_ads_conversion_outbox (
      order_ref, model, transaction_id, value_units, currency, terminal_at,
      status, skip_reason, attempts, next_attempt_at, last_error,
      google_request_id, created_at, updated_at
    ) values (?, ?, ?, ?, 'CNY', ?, ?, ?, 0, null, null, null, ?, ?)
    on conflict(order_ref) do nothing
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
