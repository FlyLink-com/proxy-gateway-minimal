import assert from "node:assert/strict";
import Database from "better-sqlite3";
import test from "node:test";

import {
  ADS_CLICK_RETENTION_MS,
  inspectAdsClickRetention,
  runAdsClickRetention
} from "../services/platform/ads-click-retention.mjs";
import { ensureAdsConversionSchema } from "../services/platform/ads-conversion-store.mjs";

const NOW = Date.parse("2026-11-01T00:00:00.000Z");
const CUTOFF = NOW - ADS_CLICK_RETENTION_MS;

function withDb(fn) {
  const db = new Database(":memory:");
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function seedClick(db, orderRef, accountRef, value, createdAt) {
  db.prepare(`
    insert into platform_ads_click_claims (
      order_ref, account_ref, model, claim_state, click_type, click_value,
      click_at, consent_ad_user_data, consent_ad_personalization,
      created_at, updated_at
    ) values (?, ?, 'legacy', 'click', 'gclid', ?, ?, 1, 0, ?, ?)
  `).run(orderRef, accountRef, value, createdAt, createdAt, createdAt);
  db.prepare(`
    insert into platform_ads_click_bindings (
      order_ref, account_ref, model, click_type, click_value, click_at,
      consent_ad_user_data, consent_ad_personalization, created_at, updated_at
    ) values (?, ?, 'legacy', 'gclid', ?, ?, 1, 0, ?, ?)
  `).run(orderRef, accountRef, value, createdAt, createdAt, createdAt);
  db.prepare(`
    insert into platform_ads_click_consent_claims (order_ref, account_ref, created_at)
    values (?, ?, ?)
  `).run(orderRef, accountRef, createdAt);
  db.prepare(`
    insert into platform_ads_conversion_outbox (
      order_ref, model, transaction_id, value_units, value_unit, terminal_at,
      status, skip_reason, attempts, next_attempt_at, last_error,
      google_request_id, created_at, updated_at
    ) values (?, 'legacy', ?, 20, 'COIN', ?, 'pending', null, 0, ?, null, null, ?, ?)
  `).run(orderRef, orderRef, createdAt, createdAt + 1000, createdAt, createdAt);
}

function snapshot(db, orderRef) {
  return {
    claim: db.prepare(`
      select claim_state, click_type, click_value, click_at,
             consent_ad_user_data, consent_ad_personalization
        from platform_ads_click_claims where order_ref = ?
    `).get(orderRef),
    binding: db.prepare(`
      select click_value from platform_ads_click_bindings where order_ref = ?
    `).get(orderRef) ?? null,
    outbox: db.prepare(`
      select status, skip_reason from platform_ads_conversion_outbox where order_ref = ?
    `).get(orderRef),
    linkCount: db.prepare(`
      select count(*) from platform_ads_click_consent_claims where order_ref = ?
    `).pluck().get(orderRef)
  };
}

test("retention inventory is aggregate-only and dry-run does not mutate rows", () => {
  withDb((db) => {
    ensureAdsConversionSchema(db);
    db.exec(`
      create table platform_ads_click_consent_claims (
        order_ref text primary key,
        account_ref text not null,
        created_at integer not null
      )
    `);
    seedClick(db, "order_ads_retention_old", "acct_ads_retention", "synthetic_old_gclid_001", CUTOFF);
    seedClick(db, "order_ads_retention_new", "acct_ads_retention", "synthetic_new_gclid_002", CUTOFF + 1);
    const before = snapshot(db, "order_ads_retention_old");

    const result = inspectAdsClickRetention(db, { now: NOW });
    assert.equal(result.status, "planned");
    assert.equal(result.mode, "dry-run");
    assert.equal(result.mutationState, "none");
    assert.deepEqual(result.counts, {
      eligibleClaimCount: 1,
      eligibleBindingCount: 1,
      eligibleConsentLinkCount: 1,
      eligibleOutboxCount: 1,
      redactedClaimCount: 0,
      deletedBindingCount: 0,
      deletedConsentLinkCount: 0,
      skippedOutboxCount: 0
    });
    assert.equal(JSON.stringify(result).includes("synthetic_old_gclid_001"), false);
    assert.equal(JSON.stringify(result).includes("order_ads_retention_old"), false);
    assert.deepEqual(snapshot(db, "order_ads_retention_old"), before);
  });
});

test("apply redacts expired click claims, deletes bindings, stops pending outbox, and is idempotent", () => {
  withDb((db) => {
    ensureAdsConversionSchema(db);
    ensureAdsConsentSchema(db);
    seedClick(db, "order_ads_retention_old", "acct_ads_retention", "synthetic_old_gclid_001", CUTOFF);
    seedClick(db, "order_ads_retention_new", "acct_ads_retention", "synthetic_new_gclid_002", CUTOFF + 1);

    const result = runAdsClickRetention(db, { now: NOW, apply: true });
    assert.equal(result.status, "completed");
    assert.equal(result.mode, "apply");
    assert.equal(result.mutationState, "committed");
    assert.deepEqual(result.counts, {
      eligibleClaimCount: 1,
      eligibleBindingCount: 1,
      eligibleConsentLinkCount: 1,
      eligibleOutboxCount: 1,
      redactedClaimCount: 1,
      deletedBindingCount: 1,
      deletedConsentLinkCount: 1,
      skippedOutboxCount: 1
    });
    assert.equal(JSON.stringify(result).includes("synthetic_old_gclid_001"), false);
    assert.equal(JSON.stringify(result).includes("order_ads_retention_old"), false);

    assert.deepEqual(snapshot(db, "order_ads_retention_old"), {
      claim: {
        claim_state: "invalid_click",
        click_type: null,
        click_value: null,
        click_at: null,
        consent_ad_user_data: null,
        consent_ad_personalization: null
      },
      binding: null,
      outbox: { status: "skipped", skip_reason: "click_retention_expired" },
      linkCount: 0
    });
    assert.deepEqual(snapshot(db, "order_ads_retention_new"), {
      claim: {
        claim_state: "click",
        click_type: "gclid",
        click_value: "synthetic_new_gclid_002",
        click_at: CUTOFF + 1,
        consent_ad_user_data: 1,
        consent_ad_personalization: 0
      },
      binding: { click_value: "synthetic_new_gclid_002" },
      outbox: { status: "pending", skip_reason: null },
      linkCount: 1
    });

    const repeated = runAdsClickRetention(db, { now: NOW, apply: true });
    assert.equal(repeated.status, "completed");
    assert.equal(repeated.mutationState, "none");
    assert.deepEqual(repeated.counts, {
      eligibleClaimCount: 0,
      eligibleBindingCount: 0,
      eligibleConsentLinkCount: 0,
      eligibleOutboxCount: 0,
      redactedClaimCount: 0,
      deletedBindingCount: 0,
      deletedConsentLinkCount: 0,
      skippedOutboxCount: 0
    });
  });
});

test("retention operation blocks without the existing claims schema and never creates tables", () => {
  withDb((db) => {
    const result = runAdsClickRetention(db, { now: NOW, apply: true });
    assert.equal(result.status, "blocked");
    assert.equal(result.mutationState, "none");
    assert.deepEqual(result.reasonCodes, ["ads_click_claim_schema_missing"]);
    assert.deepEqual(db.prepare(
      "select name from sqlite_master where type = 'table'"
    ).all(), []);
  });
});
