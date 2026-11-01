import Database from "better-sqlite3";

const SAFE_ACCOUNT_REF = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;
const ADS_FLAG = "ADS_CLICK_BINDING_ENABLED";

function consentError(code) {
  const error = new Error("Portal Ads consent operation rejected");
  error.code = code;
  return error;
}

function exactObject(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw consentError("ads_consent_invalid");
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
    || keys.some((key) => typeof key !== "string" || !fields.includes(key))) {
    throw consentError("ads_consent_invalid");
  }
  const result = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw consentError("ads_consent_invalid");
    }
    result[field] = descriptor.value;
  }
  return result;
}

function accountRef(value) {
  if (typeof value !== "string" || !SAFE_ACCOUNT_REF.test(value)) {
    throw consentError("ads_consent_invalid");
  }
  return value;
}

function tableExists(db, name) {
  return Boolean(db.prepare(
    "select 1 from sqlite_master where type = 'table' and name = ?"
  ).pluck().get(name));
}

function normalizeNow(value) {
  const at = value instanceof Date ? value.getTime() : value;
  if (!Number.isSafeInteger(at) || at < 0) {
    throw consentError("ads_consent_unavailable");
  }
  return at;
}

function featureEnabled(env) {
  return env?.[ADS_FLAG] === true || env?.[ADS_FLAG] === "true";
}

/**
 * Creates only the consent decision and non-sensitive order/account linkage
 * tables. Callers invoke this only after the Ads feature gate and an
 * authenticated Portal request have both been verified.
 */
export function ensureAdsConsentSchema(db) {
  db.exec(`
    create table if not exists platform_ads_consent_decisions (
      account_ref text primary key,
      decision text not null check (decision in ('granted', 'denied')),
      ad_user_data integer not null check (ad_user_data in (0, 1)),
      ad_personalization integer not null default 0 check (ad_personalization = 0),
      updated_at integer not null
    );

    create table if not exists platform_ads_click_consent_claims (
      order_ref text primary key,
      account_ref text not null,
      created_at integer not null
    );
  `);
}

export function hasAdsConsentForAccount(db, inputAccountRef, authorizedAt) {
  let ref;
  try {
    ref = accountRef(inputAccountRef);
    if (authorizedAt !== undefined
      && (!Number.isSafeInteger(authorizedAt) || authorizedAt < 0)) return false;
    if (!tableExists(db, "platform_ads_consent_decisions")) return false;
    const row = db.prepare(`
      select decision, ad_user_data, ad_personalization, updated_at
        from platform_ads_consent_decisions
       where account_ref = ?
    `).get(ref);
    return row?.decision === "granted"
      && row.ad_user_data === 1
      && row.ad_personalization === 0
      && (authorizedAt === undefined || row.updated_at <= authorizedAt);
  } catch {
    return false;
  }
}

export function hasAdsClickConsentClaim(db, inputOrderRef, inputAccountRef) {
  try {
    if (!tableExists(db, "platform_ads_click_consent_claims")) return false;
    const row = db.prepare(`
      select account_ref from platform_ads_click_consent_claims
       where order_ref = ?
    `).get(inputOrderRef);
    return row?.account_ref === inputAccountRef
      && hasAdsConsentForAccount(db, inputAccountRef);
  } catch {
    return false;
  }
}

export function bindAdsClickConsentClaim(db, input = {}) {
  const values = exactObject(input, ["orderRef", "accountRef", "createdAt"]);
  const orderRef = accountRef(values.orderRef);
  const account = accountRef(values.accountRef);
  if (!Number.isSafeInteger(values.createdAt) || values.createdAt < 0
    || !hasAdsConsentForAccount(db, account)
    || !tableExists(db, "platform_ads_click_consent_claims")) {
    return false;
  }
  const result = db.prepare(`
    insert into platform_ads_click_consent_claims (order_ref, account_ref, created_at)
    values (?, ?, ?)
    on conflict(order_ref) do nothing
  `).run(orderRef, account, values.createdAt);
  return result.changes === 1;
}

export function getAdsConsentForAccount(db, inputAccountRef) {
  const ref = accountRef(inputAccountRef);
  if (!tableExists(db, "platform_ads_consent_decisions")) {
    return {
      decision: "unknown",
      adUserData: null,
      adPersonalization: false,
      updatedAt: null
    };
  }
  const row = db.prepare(`
    select decision, ad_user_data, ad_personalization, updated_at
      from platform_ads_consent_decisions
     where account_ref = ?
  `).get(ref);
  if (!row) {
    return {
      decision: "unknown",
      adUserData: null,
      adPersonalization: false,
      updatedAt: null
    };
  }
  return {
    decision: row.decision,
    adUserData: row.ad_user_data === 1,
    adPersonalization: false,
    updatedAt: row.updated_at
  };
}

/**
 * Records an account-level decision made through an authenticated Portal
 * session. Personalization is structurally fixed to false. Revocation removes
 * raw click values from claims and bindings, stops pending outbox rows, and
 * returns aggregate counts only.
 */
export function recordAdsConsentDecision(db, input = {}, options = {}) {
  const env = options.env ?? process.env;
  if (!featureEnabled(env)) return null;
  const values = exactObject(input, ["accountRef", "adUserData"]);
  const ref = accountRef(values.accountRef);
  if (typeof values.adUserData !== "boolean") {
    throw consentError("ads_consent_invalid");
  }
  const at = normalizeNow(options.now ?? (options.nowFn ? options.nowFn() : Date.now()));
  ensureAdsConsentSchema(db);

  const transaction = db.transaction(() => {
    db.prepare(`
      insert into platform_ads_consent_decisions (
        account_ref, decision, ad_user_data, ad_personalization, updated_at
      ) values (?, ?, ?, 0, ?)
      on conflict(account_ref) do update set
        decision = excluded.decision,
        ad_user_data = excluded.ad_user_data,
        ad_personalization = 0,
        updated_at = excluded.updated_at
    `).run(ref, values.adUserData ? "granted" : "denied", values.adUserData ? 1 : 0, at);

    const revocation = {
      redactedClaimCount: 0,
      deletedBindingCount: 0,
      skippedOutboxCount: 0,
      deletedLinkCount: 0
    };
    const unverifiedCleanup = {
      redactedClaimCount: 0,
      deletedBindingCount: 0,
      skippedOutboxCount: 0
    };
    const hasClaims = tableExists(db, "platform_ads_click_claims");
    const hasBindings = tableExists(db, "platform_ads_click_bindings");
    const hasOutbox = tableExists(db, "platform_ads_conversion_outbox");
    const unverifiedOrders = `
      select order_ref from platform_ads_click_claims
       where account_ref = ? and claim_state = 'click'
         and order_ref not in (
           select order_ref from platform_ads_click_consent_claims
            where account_ref = ?
         )
    `;

    if (!values.adUserData) {
      // A withdrawal invalidates every raw click value for the account,
      // including legacy claims created before the server consent ledger.
      if (hasOutbox && hasClaims) {
        revocation.skippedOutboxCount = db.prepare(`
          update platform_ads_conversion_outbox
             set status = 'skipped',
                 skip_reason = 'consent_revoked',
                 next_attempt_at = null,
                 last_error = null,
                 updated_at = ?
           where status = 'pending'
             and order_ref in (
               select order_ref from platform_ads_click_claims
                where account_ref = ? and claim_state = 'click'
             )
        `).run(at, ref).changes;
      }
      if (hasBindings) {
        revocation.deletedBindingCount = db.prepare(`
          delete from platform_ads_click_bindings where account_ref = ?
        `).run(ref).changes;
      }
      if (hasClaims) {
        revocation.redactedClaimCount = db.prepare(`
          update platform_ads_click_claims
             set claim_state = 'invalid_click',
                 click_type = null,
                 click_value = null,
                 click_at = null,
                 consent_ad_user_data = null,
                 consent_ad_personalization = null,
                 updated_at = ?
           where account_ref = ? and claim_state = 'click'
        `).run(at, ref).changes;
      }
      revocation.deletedLinkCount = db.prepare(`
        delete from platform_ads_click_consent_claims where account_ref = ?
      `).run(ref).changes;
    } else if (hasClaims) {
      // A newly granted account decision must not retroactively authorize
      // raw identifiers captured before the server consent ledger existed.
      if (hasOutbox) {
        unverifiedCleanup.skippedOutboxCount = db.prepare(`
          update platform_ads_conversion_outbox
             set status = 'skipped',
                 skip_reason = 'consent_unverified',
                 next_attempt_at = null,
                 last_error = null,
                 updated_at = ?
           where status = 'pending'
             and order_ref in (${unverifiedOrders})
        `).run(at, ref, ref).changes;
      }
      if (hasBindings) {
        unverifiedCleanup.deletedBindingCount = db.prepare(`
          delete from platform_ads_click_bindings
           where account_ref = ? and order_ref in (${unverifiedOrders})
        `).run(ref, ref, ref).changes;
      }
      unverifiedCleanup.redactedClaimCount = db.prepare(`
        update platform_ads_click_claims
           set claim_state = 'invalid_click',
               click_type = null,
               click_value = null,
               click_at = null,
               consent_ad_user_data = null,
               consent_ad_personalization = null,
               updated_at = ?
         where account_ref = ? and claim_state = 'click'
           and order_ref not in (
             select order_ref from platform_ads_click_consent_claims
              where account_ref = ?
           )
      `).run(at, ref, ref).changes;
    }
    return {
      decision: values.adUserData ? "granted" : "denied",
      adUserData: values.adUserData,
      adPersonalization: false,
      updatedAt: at,
      revocation,
      unverifiedCleanup
    };
  });
  return transaction.immediate();
}

export function createSqliteAdsConsentStore(options = {}) {
  const values = exactObject(options, ["dbPath", "database", "env", "nowFn"].filter(
    (field) => Object.hasOwn(options, field)
  ));
  const hasPath = Object.hasOwn(values, "dbPath");
  const hasDatabase = Object.hasOwn(values, "database");
  if (hasPath === hasDatabase) throw consentError("ads_consent_invalid");
  if (values.env !== undefined && (!values.env || typeof values.env !== "object")) {
    throw consentError("ads_consent_invalid");
  }
  if (values.nowFn !== undefined && typeof values.nowFn !== "function") {
    throw consentError("ads_consent_invalid");
  }

  let db = values.database ?? null;
  let owned = false;
  if (!db) {
    if (typeof values.dbPath !== "string" || !values.dbPath.trim()) {
      throw consentError("ads_consent_invalid");
    }
    db = new Database(values.dbPath, { fileMustExist: true });
    db.pragma("busy_timeout = 2000");
    owned = true;
  }
  if (typeof db.prepare !== "function" || typeof db.transaction !== "function"
    || typeof db.exec !== "function" || db.open !== true) {
    if (owned) db.close();
    throw consentError("ads_consent_invalid");
  }

  let closed = false;
  function assertOpen() {
    if (closed) throw consentError("ads_consent_unavailable");
  }

  return Object.freeze({
    getConsent(input) {
      assertOpen();
      const request = exactObject(input, ["accountRef"]);
      return getAdsConsentForAccount(db, request.accountRef);
    },
    recordConsent(input) {
      assertOpen();
      const request = exactObject(input, ["accountRef", "adUserData"]);
      return recordAdsConsentDecision(db, request, {
        env: values.env ?? process.env,
        now: values.nowFn ? values.nowFn() : Date.now()
      });
    },
    close() {
      if (closed) return;
      closed = true;
      if (owned) db.close();
    }
  });
}
