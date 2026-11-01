export const ADS_CLICK_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const CLAIMS = "platform_ads_click_claims";
const BINDINGS = "platform_ads_click_bindings";
const CONSENT_LINKS = "platform_ads_click_consent_claims";
const OUTBOX = "platform_ads_conversion_outbox";

function retentionError(code) {
  const error = new Error("Ads click retention operation rejected");
  error.code = code;
  return error;
}

function tableExists(db, name) {
  return Boolean(db.prepare(
    "select 1 from sqlite_master where type = 'table' and name = ?"
  ).pluck().get(name));
}

function normalizeNow(value) {
  const at = value instanceof Date ? value.getTime() : value;
  if (!Number.isSafeInteger(at) || at < 0) {
    throw retentionError("ads_click_retention_invalid_time");
  }
  return at;
}

function schemaState(db) {
  return {
    claims: tableExists(db, CLAIMS),
    bindings: tableExists(db, BINDINGS),
    consentLinks: tableExists(db, CONSENT_LINKS),
    outbox: tableExists(db, OUTBOX)
  };
}

function expiredOrderSubquery(schema) {
  const sources = [];
  if (schema.claims) {
    sources.push(`
      select order_ref from ${CLAIMS}
       where created_at <= ?
    `);
  }
  if (schema.bindings) {
    sources.push(`
      select order_ref from ${BINDINGS}
       where created_at <= ?
    `);
  }
  return sources.length ? `(${sources.join(" union ")})` : "(select null where 0)";
}

function subqueryParameters(schema, cutoff) {
  const values = [];
  if (schema.claims) values.push(cutoff);
  if (schema.bindings) values.push(cutoff);
  return values;
}

function count(db, sql, values = []) {
  return db.prepare(sql).pluck().get(...values) ?? 0;
}

function inventoryCounts(db, cutoff, schema) {
  const orderRefs = expiredOrderSubquery(schema);
  const orderRefValues = subqueryParameters(schema, cutoff);
  const eligibleClaimCount = schema.claims
    ? count(db, `
        select count(*) from ${CLAIMS}
         where created_at <= ?
      `, [cutoff])
    : 0;
  const eligibleBindingCount = schema.bindings
    ? count(db, `
        select count(*) from ${BINDINGS}
         where created_at <= ? or order_ref in ${orderRefs}
      `, [cutoff, ...orderRefValues])
    : 0;
  const eligibleConsentLinkCount = schema.consentLinks
    ? count(db, `
        select count(*) from ${CONSENT_LINKS}
         where order_ref in ${orderRefs}
      `, orderRefValues)
    : 0;
  const eligibleOutboxCount = schema.outbox
    ? count(db, `
        select count(*) from ${OUTBOX}
         where status = 'pending' and order_ref in ${orderRefs}
      `, orderRefValues)
    : 0;
  return {
    eligibleClaimCount,
    eligibleBindingCount,
    eligibleConsentLinkCount,
    eligibleOutboxCount
  };
}

function commandResult({
  mode,
  status,
  mutationState,
  cutoffAt,
  counts,
  reasonCodes = []
}) {
  return Object.freeze({
    schemaVersion: "1",
    command: "ads_click_retention",
    mode,
    status,
    mutationState,
    cutoffAt,
    counts: Object.freeze({
      eligibleClaimCount: counts.eligibleClaimCount ?? 0,
      eligibleBindingCount: counts.eligibleBindingCount ?? 0,
      eligibleConsentLinkCount: counts.eligibleConsentLinkCount ?? 0,
      eligibleOutboxCount: counts.eligibleOutboxCount ?? 0,
      deletedClaimCount: counts.deletedClaimCount ?? 0,
      deletedBindingCount: counts.deletedBindingCount ?? 0,
      deletedConsentLinkCount: counts.deletedConsentLinkCount ?? 0,
      skippedOutboxCount: counts.skippedOutboxCount ?? 0
    }),
    reasonCodes: Object.freeze([...reasonCodes])
  });
}

/**
 * Inventory only. This function reads aggregate counts and never selects or
 * returns order references, account references, click values, or raw rows.
 * It does not create tables or mutate data.
 */
export function inspectAdsClickRetention(db, options = {}) {
  const at = normalizeNow(options.now ?? Date.now());
  const cutoff = at - ADS_CLICK_RETENTION_MS;
  const schema = schemaState(db);
  const cutoffAt = new Date(cutoff).toISOString();
  if (!schema.claims) {
    return commandResult({
      mode: "dry-run",
      status: "blocked",
      mutationState: "none",
      cutoffAt,
      counts: {},
      reasonCodes: ["ads_click_claim_schema_missing"]
    });
  }
  return commandResult({
    mode: "dry-run",
    status: "planned",
    mutationState: "none",
    cutoffAt,
    counts: inventoryCounts(db, cutoff, schema)
  });
}

/**
 * Explicitly invoked, injected-database retention operation. No path opening,
 * scheduling, production wiring, or automatic execution is provided here.
 * Apply deletes expired claim rows, raw bindings, and consent linkage, and
 * prevents pending outbox work from being sent after click data expires.
 * Purchase idempotency receipts remain the replay authority; replay paths
 * only materialize an existing claim and never recapture a click descriptor.
 */
export function runAdsClickRetention(db, options = {}) {
  const apply = options.apply === true;
  if (options.apply !== undefined && typeof options.apply !== "boolean") {
    throw retentionError("ads_click_retention_invalid_mode");
  }
  const at = normalizeNow(options.now ?? Date.now());
  const cutoff = at - ADS_CLICK_RETENTION_MS;
  const cutoffAt = new Date(cutoff).toISOString();
  const schema = schemaState(db);
  if (!schema.claims) {
    return commandResult({
      mode: apply ? "apply" : "dry-run",
      status: "blocked",
      mutationState: "none",
      cutoffAt,
      counts: {},
      reasonCodes: ["ads_click_claim_schema_missing"]
    });
  }

  if (!apply) {
    return commandResult({
      mode: "dry-run",
      status: "planned",
      mutationState: "none",
      cutoffAt,
      counts: inventoryCounts(db, cutoff, schema)
    });
  }

  const transaction = db.transaction(() => {
    const before = inventoryCounts(db, cutoff, schema);
    const orderRefs = expiredOrderSubquery(schema);
    const orderRefValues = subqueryParameters(schema, cutoff);
    const changed = {
      deletedClaimCount: 0,
      deletedBindingCount: 0,
      deletedConsentLinkCount: 0,
      skippedOutboxCount: 0
    };

    if (schema.outbox && (schema.claims || schema.bindings)) {
      changed.skippedOutboxCount = db.prepare(`
        update ${OUTBOX}
           set status = 'skipped',
               skip_reason = 'click_retention_expired',
               next_attempt_at = null,
               last_error = null,
               updated_at = ?
         where status = 'pending'
           and order_ref in ${orderRefs}
      `).run(at, ...orderRefValues).changes;
    }

    if (schema.bindings) {
      changed.deletedBindingCount = db.prepare(`
        delete from ${BINDINGS}
         where created_at <= ? or order_ref in ${orderRefs}
      `).run(cutoff, ...orderRefValues).changes;
    }

    if (schema.consentLinks && (schema.claims || schema.bindings)) {
      changed.deletedConsentLinkCount = db.prepare(`
        delete from ${CONSENT_LINKS}
         where order_ref in ${orderRefs}
      `).run(...orderRefValues).changes;
    }

    changed.deletedClaimCount = db.prepare(`
      delete from ${CLAIMS} where created_at <= ?
    `).run(cutoff).changes;

    return { before, changed };
  });
  const { before, changed } = transaction.immediate();
  const mutationCount = Object.values(changed).reduce((sum, value) => sum + value, 0);
  return commandResult({
    mode: "apply",
    status: "completed",
    mutationState: mutationCount > 0 ? "committed" : "none",
    cutoffAt,
    counts: {
      ...before,
      ...changed
    }
  });
}
