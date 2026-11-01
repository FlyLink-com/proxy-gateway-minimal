import assert from "node:assert/strict";
import Database from "better-sqlite3";
import test from "node:test";

import {
  bindAdsClickConsentClaim,
  createSqliteAdsConsentStore,
  ensureAdsConsentSchema,
  getAdsConsentForAccount,
  hasAdsConsentForAccount
} from "../services/platform/ads-consent-store.mjs";
import {
  ensureAdsConversionSchema,
  getAdsClickBinding,
  getAdsClickClaim,
  safeCaptureAdsClickForOrder
} from "../services/platform/ads-conversion-store.mjs";

const ENABLED = { ADS_CLICK_BINDING_ENABLED: "true" };
const DISABLED = {};
const ACCOUNT = "acct_ads_consent_test";
const NOW = Date.parse("2026-11-01T00:00:00.000Z");

function withDb(fn) {
  const db = new Database(":memory:");
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function tableNames(db) {
  return db.prepare(
    "select name from sqlite_master where type = 'table' order by name"
  ).all().map((row) => row.name);
}

test("consent reads are unknown and do not create schema by default", () => {
  withDb((db) => {
    const store = createSqliteAdsConsentStore({
      database: db,
      env: DISABLED,
      nowFn: () => NOW
    });
    assert.deepEqual(store.getConsent({ accountRef: ACCOUNT }), {
      decision: "unknown",
      adUserData: null,
      adPersonalization: false,
      updatedAt: null
    });
    assert.equal(store.recordConsent({ accountRef: ACCOUNT, adUserData: true }), null);
    assert.deepEqual(tableNames(db), []);
    store.close();
  });
});

test("only an explicit authenticated-store grant authorizes ad-user-data measurement", () => {
  withDb((db) => {
    const store = createSqliteAdsConsentStore({
      database: db,
      env: ENABLED,
      nowFn: () => NOW
    });
    assert.equal(hasAdsConsentForAccount(db, ACCOUNT), false);
    const granted = store.recordConsent({ accountRef: ACCOUNT, adUserData: true });
    assert.deepEqual(granted, {
      decision: "granted",
      adUserData: true,
      adPersonalization: false,
      updatedAt: NOW,
      revocation: {
        redactedClaimCount: 0,
        deletedBindingCount: 0,
        skippedOutboxCount: 0,
        deletedLinkCount: 0
      },
      unverifiedCleanup: {
        redactedClaimCount: 0,
        deletedBindingCount: 0,
        skippedOutboxCount: 0
      }
    });
    assert.equal(hasAdsConsentForAccount(db, ACCOUNT), true);
    assert.equal(hasAdsConsentForAccount(db, "acct_other"), false);
    assert.deepEqual(store.getConsent({ accountRef: ACCOUNT }), {
      decision: "granted",
      adUserData: true,
      adPersonalization: false,
      updatedAt: NOW
    });
    store.close();
  });
});


test("first server grant compacts legacy click rows that have no server-consent linkage", () => {
  withDb((db) => {
    const store = createSqliteAdsConsentStore({
      database: db,
      env: ENABLED,
      nowFn: () => NOW
    });
    ensureAdsConsentSchema(db);
    ensureAdsConversionSchema(db);
    db.prepare(`
      insert into platform_ads_click_claims (
        order_ref, account_ref, model, claim_state, click_type, click_value,
        click_at, consent_ad_user_data, consent_ad_personalization,
        created_at, updated_at
      ) values (?, ?, 'legacy', 'click', 'gclid', ?, ?, 1, 0, ?, ?)
    `).run("order_ads_consent_legacy", ACCOUNT, "synthetic_legacy_click_003", NOW - 1000, NOW - 500, NOW - 500);
    db.prepare(`
      insert into platform_ads_click_bindings (
        order_ref, account_ref, model, click_type, click_value, click_at,
        consent_ad_user_data, consent_ad_personalization, created_at, updated_at
      ) values (?, ?, 'legacy', 'gclid', ?, ?, 1, 0, ?, ?)
    `).run("order_ads_consent_legacy", ACCOUNT, "synthetic_legacy_click_003", NOW - 1000, NOW - 400, NOW - 400);
    db.prepare(`
      insert into platform_ads_conversion_outbox (
        order_ref, model, transaction_id, value_units, value_unit, terminal_at,
        status, skip_reason, attempts, next_attempt_at, last_error,
        google_request_id, created_at, updated_at
      ) values (?, 'legacy', ?, 20, 'COIN', ?, 'pending', null, 0, ?, null, null, ?, ?)
    `).run("order_ads_consent_legacy", "order_ads_consent_legacy", NOW, NOW + 1000, NOW - 300, NOW - 300);

    const granted = store.recordConsent({ accountRef: ACCOUNT, adUserData: true });
    assert.deepEqual(granted.unverifiedCleanup, {
      redactedClaimCount: 1,
      deletedBindingCount: 1,
      skippedOutboxCount: 1
    });
    assert.deepEqual(db.prepare(`
      select claim_state, click_value from platform_ads_click_claims where order_ref = ?
    `).get("order_ads_consent_legacy"), {
      claim_state: "invalid_click",
      click_value: null
    });
    assert.equal(db.prepare(
      "select count(*) from platform_ads_click_bindings where order_ref = ?"
    ).pluck().get("order_ads_consent_legacy"), 0);
    assert.deepEqual(db.prepare(`
      select status, skip_reason from platform_ads_conversion_outbox where order_ref = ?
    `).get("order_ads_consent_legacy"), {
      status: "skipped",
      skip_reason: "consent_unverified"
    });
    assert.equal(JSON.stringify(granted).includes("synthetic_legacy_click_003"), false);
    store.close();
  });
});

test("revocation removes raw click identifiers and stops pending conversion rows with aggregate-only output", () => {
  withDb((db) => {
    const store = createSqliteAdsConsentStore({
      database: db,
      env: ENABLED,
      nowFn: () => NOW
    });
    store.recordConsent({ accountRef: ACCOUNT, adUserData: true });
    ensureAdsConsentSchema(db);
    ensureAdsConversionSchema(db);

    db.prepare(`
      insert into platform_ads_click_claims (
        order_ref, account_ref, model, claim_state, click_type, click_value,
        click_at, consent_ad_user_data, consent_ad_personalization,
        created_at, updated_at
      ) values (?, ?, 'legacy', 'click', 'gclid', ?, ?, 1, 0, ?, ?)
    `).run("order_ads_consent_001", ACCOUNT, "synthetic_gclid_value_001", NOW - 1000, NOW - 500, NOW - 500);
    db.prepare(`
      insert into platform_ads_click_bindings (
        order_ref, account_ref, model, click_type, click_value, click_at,
        consent_ad_user_data, consent_ad_personalization, created_at, updated_at
      ) values (?, ?, 'legacy', 'gclid', ?, ?, 1, 0, ?, ?)
    `).run("order_ads_consent_001", ACCOUNT, "synthetic_gclid_value_001", NOW - 1000, NOW - 400, NOW - 400);
    db.prepare(`
      insert into platform_ads_conversion_outbox (
        order_ref, model, transaction_id, value_units, value_unit, terminal_at,
        status, skip_reason, attempts, next_attempt_at, last_error,
        google_request_id, created_at, updated_at
      ) values (?, 'legacy', ?, 20, 'COIN', ?, 'pending', null, 0, ?, null, null, ?, ?)
    `).run("order_ads_consent_001", "order_ads_consent_001", NOW, NOW + 1000, NOW - 300, NOW - 300);
    assert.equal(bindAdsClickConsentClaim(db, {
      orderRef: "order_ads_consent_001",
      accountRef: ACCOUNT,
      createdAt: NOW - 500
    }), true);
    db.prepare(`
      insert into platform_ads_click_claims (
        order_ref, account_ref, model, claim_state, click_type, click_value,
        click_at, consent_ad_user_data, consent_ad_personalization,
        created_at, updated_at
      ) values (?, ?, 'legacy', 'click', 'gbraid', ?, ?, 1, 0, ?, ?)
    `).run("order_ads_consent_unlinked", ACCOUNT, "synthetic_unlinked_click_004", NOW - 1000, NOW - 500, NOW - 500);
    db.prepare(`
      insert into platform_ads_click_bindings (
        order_ref, account_ref, model, click_type, click_value, click_at,
        consent_ad_user_data, consent_ad_personalization, created_at, updated_at
      ) values (?, ?, 'legacy', 'gbraid', ?, ?, 1, 0, ?, ?)
    `).run("order_ads_consent_unlinked", ACCOUNT, "synthetic_unlinked_click_004", NOW - 1000, NOW - 400, NOW - 400);
    db.prepare(`
      insert into platform_ads_conversion_outbox (
        order_ref, model, transaction_id, value_units, value_unit, terminal_at,
        status, skip_reason, attempts, next_attempt_at, last_error,
        google_request_id, created_at, updated_at
      ) values (?, 'legacy', ?, 20, 'COIN', ?, 'pending', null, 0, ?, null, null, ?, ?)
    `).run("order_ads_consent_unlinked", "order_ads_consent_unlinked", NOW, NOW + 1000, NOW - 300, NOW - 300);

    const denied = store.recordConsent({ accountRef: ACCOUNT, adUserData: false });
    assert.deepEqual(denied, {
      decision: "denied",
      adUserData: false,
      adPersonalization: false,
      updatedAt: NOW,
      revocation: {
        redactedClaimCount: 2,
        deletedBindingCount: 2,
        skippedOutboxCount: 2,
        deletedLinkCount: 1
      },
      unverifiedCleanup: {
        redactedClaimCount: 0,
        deletedBindingCount: 0,
        skippedOutboxCount: 0
      }
    });
    assert.equal(JSON.stringify(denied).includes("synthetic_gclid_value_001"), false);
    assert.equal(JSON.stringify(denied).includes("synthetic_unlinked_click_004"), false);
    assert.equal(hasAdsConsentForAccount(db, ACCOUNT), false);

    const claim = db.prepare(`
      select claim_state, click_type, click_value, click_at,
             consent_ad_user_data, consent_ad_personalization
        from platform_ads_click_claims where order_ref = ?
    `).get("order_ads_consent_001");
    assert.deepEqual(claim, {
      claim_state: "invalid_click",
      click_type: null,
      click_value: null,
      click_at: null,
      consent_ad_user_data: null,
      consent_ad_personalization: null
    });
    assert.equal(db.prepare(
      "select count(*) from platform_ads_click_bindings where order_ref = ?"
    ).pluck().get("order_ads_consent_001"), 0);
    assert.deepEqual(db.prepare(
      "select status, skip_reason, transaction_id from platform_ads_conversion_outbox where order_ref = ?"
    ).get("order_ads_consent_001"), {
      status: "skipped",
      skip_reason: "consent_revoked",
      transaction_id: "order_ads_consent_001"
    });
    assert.equal(db.prepare(
      "select count(*) from platform_ads_click_consent_claims where account_ref = ?"
    ).pluck().get(ACCOUNT), 0);
    assert.deepEqual(db.prepare(`
      select claim_state, click_value from platform_ads_click_claims where order_ref = ?
    `).get("order_ads_consent_unlinked"), {
      claim_state: "invalid_click",
      click_value: null
    });
    assert.equal(db.prepare(
      "select count(*) from platform_ads_click_bindings where order_ref = ?"
    ).pluck().get("order_ads_consent_unlinked"), 0);
    assert.deepEqual(db.prepare(`
      select status, skip_reason from platform_ads_conversion_outbox where order_ref = ?
    `).get("order_ads_consent_unlinked"), {
      status: "skipped",
      skip_reason: "consent_revoked"
    });

    const repeated = store.recordConsent({ accountRef: ACCOUNT, adUserData: false });
    assert.deepEqual(repeated.revocation, {
      redactedClaimCount: 0,
      deletedBindingCount: 0,
      skippedOutboxCount: 0,
      deletedLinkCount: 0
    });
    store.close();
  });
});


test("a client-supplied consent descriptor cannot persist a click without server consent", () => {
  withDb((db) => {
    const store = createSqliteAdsConsentStore({
      database: db,
      env: ENABLED,
      nowFn: () => NOW
    });
    const click = {
      type: "gclid",
      value: "synthetic_forged_client_click_001",
      clickAt: new Date(NOW - 1000).toISOString(),
      consent: { adUserData: true, adPersonalization: false }
    };
    const binding = safeCaptureAdsClickForOrder(db, {
      orderRef: "order_ads_consent_forged",
      accountRef: ACCOUNT,
      model: "legacy",
      adsClick: click
    }, { env: ENABLED, now: NOW });
    assert.equal(binding, null);
    assert.equal(getAdsClickClaim(db, "order_ads_consent_forged").claimState, "invalid_click");
    assert.equal(getAdsClickClaim(db, "order_ads_consent_forged").clickValue, null);
    assert.equal(getAdsClickBinding(db, "order_ads_consent_forged"), null);
    assert.equal(db.prepare(
      "select count(*) from platform_ads_click_consent_claims"
    ).pluck().get(), 0);

    store.recordConsent({ accountRef: ACCOUNT, adUserData: true });
    const accepted = safeCaptureAdsClickForOrder(db, {
      orderRef: "order_ads_consent_granted",
      accountRef: ACCOUNT,
      model: "legacy",
      adsClick: click
    }, { env: ENABLED, now: NOW });
    assert.equal(accepted.clickValue, click.value);
    store.close();
  });
});


test("a consent grant recorded after the purchase timestamp cannot authorize that order", () => {
  withDb((db) => {
    const store = createSqliteAdsConsentStore({
      database: db,
      env: ENABLED,
      nowFn: () => NOW
    });
    store.recordConsent({ accountRef: ACCOUNT, adUserData: true });
    const click = {
      type: "gclid",
      value: "synthetic_late_consent_click_002",
      clickAt: new Date(NOW - 1000).toISOString(),
      consent: { adUserData: true, adPersonalization: false }
    };
    const binding = safeCaptureAdsClickForOrder(db, {
      orderRef: "order_ads_consent_late",
      accountRef: ACCOUNT,
      model: "legacy",
      adsClick: click,
      authorizedAt: NOW - 1
    }, { env: ENABLED, now: NOW + 1000 });
    assert.equal(binding, null);
    assert.equal(getAdsClickClaim(db, "order_ads_consent_late").claimState, "invalid_click");
    assert.equal(getAdsClickClaim(db, "order_ads_consent_late").clickValue, null);
    store.close();
  });
});

test("consent schema is created only by an enabled, explicit decision write", () => {
  withDb((db) => {
    assert.deepEqual(getAdsConsentForAccount(db, ACCOUNT), {
      decision: "unknown",
      adUserData: null,
      adPersonalization: false,
      updatedAt: null
    });
    assert.deepEqual(tableNames(db), []);
    const store = createSqliteAdsConsentStore({
      database: db,
      env: ENABLED,
      nowFn: () => NOW
    });
    store.recordConsent({ accountRef: ACCOUNT, adUserData: true });
    assert.deepEqual(tableNames(db), [
      "platform_ads_click_consent_claims",
      "platform_ads_consent_decisions"
    ]);
    store.close();
  });
});
