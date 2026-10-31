import assert from "node:assert/strict";
import Database from "better-sqlite3";
import test from "node:test";
import {
  adsBindingEnabled,
  bindAdsClick,
  enqueueAdsConversion,
  ensureAdsConversionSchema,
  getAdsClickBinding,
  getAdsConversionOutboxRow,
  validateAdsClick
} from "../services/platform/ads-conversion-store.mjs";

const NOW = Date.parse("2026-10-31T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const ENABLED = { ADS_CLICK_BINDING_ENABLED: "true" };
const DISABLED = {};

function validClick(overrides = {}) {
  return {
    type: "gclid",
    value: "EAIaIQobChMI-test_click.001",
    clickAt: new Date(NOW - 60_000).toISOString(),
    consent: { adUserData: true, adPersonalization: false },
    ...overrides
  };
}

function withDb(fn) {
  const db = new Database(":memory:");
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function tableNames(db) {
  return db.prepare(`
    select name from sqlite_master where type = 'table' order by name
  `).all().map((row) => row.name);
}

test("adsBindingEnabled defaults off and only accepts the true literal", () => {
  assert.equal(adsBindingEnabled({}), false);
  assert.equal(adsBindingEnabled({ ADS_CLICK_BINDING_ENABLED: "false" }), false);
  assert.equal(adsBindingEnabled({ ADS_CLICK_BINDING_ENABLED: "1" }), false);
  assert.equal(adsBindingEnabled({ ADS_CLICK_BINDING_ENABLED: "TRUE" }), false);
  assert.equal(adsBindingEnabled({ ADS_CLICK_BINDING_ENABLED: "true" }), true);
  assert.equal(adsBindingEnabled({ ADS_CLICK_BINDING_ENABLED: true }), true);
});

test("validateAdsClick normalizes ISO and epoch click times for all click types", () => {
  for (const type of ["gclid", "gbraid", "wbraid"]) {
    const normalized = validateAdsClick(validClick({ type }), NOW);
    assert.equal(normalized.type, type);
    assert.equal(normalized.value, "EAIaIQobChMI-test_click.001");
    assert.equal(normalized.clickAt, NOW - 60_000);
    assert.deepEqual(normalized.consent, {
      adUserData: true,
      adPersonalization: false
    });
  }
  const epoch = validateAdsClick(validClick({ clickAt: NOW - 5_000 }), NOW);
  assert.equal(epoch.clickAt, NOW - 5_000);
  const boundary = validateAdsClick(
    validClick({ clickAt: NOW - 90 * DAY_MS }),
    NOW
  );
  assert.equal(boundary.clickAt, NOW - 90 * DAY_MS);
});

test("validateAdsClick rejects malformed descriptors", () => {
  const cases = [
    null,
    "gclid",
    [],
    validClick({ type: "dclid" }),
    validClick({ type: "" }),
    validClick({ value: "" }),
    validClick({ value: "has space" }),
    validClick({ value: "bad/slash" }),
    validClick({ value: "x".repeat(513) }),
    validClick({ value: 42 }),
    validClick({ clickAt: "not-a-date" }),
    validClick({ clickAt: NOW + 1_000 }),
    validClick({ clickAt: NOW - 90 * DAY_MS - 1 }),
    validClick({ clickAt: null }),
    validClick({ consent: null }),
    validClick({ consent: { adUserData: "yes", adPersonalization: false } }),
    validClick({ consent: { adUserData: true } })
  ];
  for (const input of cases) {
    assert.equal(validateAdsClick(input, NOW), null, JSON.stringify(input));
  }
});

test("ensureAdsConversionSchema creates both tables idempotently", () => {
  withDb((db) => {
    ensureAdsConversionSchema(db);
    ensureAdsConversionSchema(db);
    assert.deepEqual(tableNames(db), [
      "platform_ads_click_bindings",
      "platform_ads_conversion_outbox"
    ]);
  });
});

test("bindAdsClick stores the first binding and ignores repeat submissions", () => {
  withDb((db) => {
    const first = bindAdsClick(db, {
      orderRef: "order_ads_001",
      accountRef: "account_ads_001",
      model: "legacy",
      adsClick: validClick()
    }, { env: ENABLED, now: NOW });
    assert.equal(first.clickType, "gclid");
    assert.equal(first.clickAt, NOW - 60_000);
    assert.equal(first.consentAdUserData, true);
    assert.equal(first.consentAdPersonalization, false);

    const second = bindAdsClick(db, {
      orderRef: "order_ads_001",
      accountRef: "account_ads_001",
      model: "legacy",
      adsClick: validClick({ value: "ZZZ-different-click" })
    }, { env: ENABLED, now: NOW + 1_000 });
    assert.equal(second.clickValue, "EAIaIQobChMI-test_click.001");
    assert.equal(second.createdAt, NOW);
    assert.equal(
      db.prepare(`select count(*) from platform_ads_click_bindings`).pluck().get(),
      1
    );
  });
});

test("bindAdsClick ignores invalid descriptors and invalid references", () => {
  withDb((db) => {
    const result = bindAdsClick(db, {
      orderRef: "order_ads_002",
      accountRef: "account_ads_001",
      model: "deferred",
      adsClick: validClick({ value: "bad value" })
    }, { env: ENABLED, now: NOW });
    assert.equal(result, null);
    assert.equal(getAdsClickBinding(db, "order_ads_002"), null);
    assert.equal(bindAdsClick(db, {
      orderRef: "order_ads_002",
      accountRef: "account_ads_001",
      model: "unknown",
      adsClick: validClick()
    }, { env: ENABLED, now: NOW }), null);
  });
});

test("flag off makes bind and enqueue complete no-ops with no tables created", () => {
  withDb((db) => {
    assert.equal(bindAdsClick(db, {
      orderRef: "order_ads_003",
      accountRef: "account_ads_001",
      model: "legacy",
      adsClick: validClick()
    }, { env: DISABLED, now: NOW }), null);
    assert.equal(enqueueAdsConversion(db, {
      orderRef: "order_ads_003",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW
    }, { env: DISABLED, now: NOW }), null);
    assert.equal(adsBindingEnabled(DISABLED), false);
    assert.deepEqual(tableNames(db), []);
  });
});

test("enqueueAdsConversion records skipped/no_click without a binding", () => {
  withDb((db) => {
    const row = enqueueAdsConversion(db, {
      orderRef: "order_ads_004",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW
    }, { env: ENABLED, now: NOW });
    assert.equal(row.status, "skipped");
    assert.equal(row.skipReason, "no_click");
    assert.equal(row.transactionId, "order_ads_004");
    assert.equal(row.valueUnits, 20);
    assert.equal(row.currency, "CNY");
    assert.equal(row.terminalAt, NOW);
  });
});

test("enqueueAdsConversion records skipped/consent_denied when ad user data consent is absent", () => {
  withDb((db) => {
    bindAdsClick(db, {
      orderRef: "order_ads_005",
      accountRef: "account_ads_001",
      model: "deferred",
      adsClick: validClick({
        consent: { adUserData: false, adPersonalization: false }
      })
    }, { env: ENABLED, now: NOW });
    const row = enqueueAdsConversion(db, {
      orderRef: "order_ads_005",
      model: "deferred",
      valueUnits: 30,
      terminalAt: NOW
    }, { env: ENABLED, now: NOW });
    assert.equal(row.status, "skipped");
    assert.equal(row.skipReason, "consent_denied");
    assert.equal(row.model, "deferred");
  });
});

test("enqueueAdsConversion records pending for bound consented orders in both models", () => {
  withDb((db) => {
    for (const [model, orderRef, valueUnits] of [
      ["legacy", "order_ads_006", 20],
      ["deferred", "order_ads_007", 200]
    ]) {
      bindAdsClick(db, {
        orderRef,
        accountRef: "account_ads_001",
        model,
        adsClick: validClick()
      }, { env: ENABLED, now: NOW });
      const row = enqueueAdsConversion(db, {
        orderRef,
        model,
        valueUnits,
        terminalAt: NOW + 1_000
      }, { env: ENABLED, now: NOW + 1_000 });
      assert.equal(row.status, "pending");
      assert.equal(row.skipReason, null);
      assert.equal(row.model, model);
      assert.equal(row.valueUnits, valueUnits);
      assert.equal(row.attempts, 0);
    }
  });
});

test("enqueueAdsConversion is idempotent per order", () => {
  withDb((db) => {
    bindAdsClick(db, {
      orderRef: "order_ads_008",
      accountRef: "account_ads_001",
      model: "legacy",
      adsClick: validClick()
    }, { env: ENABLED, now: NOW });
    const first = enqueueAdsConversion(db, {
      orderRef: "order_ads_008",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW
    }, { env: ENABLED, now: NOW });
    const second = enqueueAdsConversion(db, {
      orderRef: "order_ads_008",
      model: "legacy",
      valueUnits: 999,
      terminalAt: NOW + 5_000
    }, { env: ENABLED, now: NOW + 5_000 });
    assert.equal(second.valueUnits, first.valueUnits);
    assert.equal(second.terminalAt, first.terminalAt);
    assert.equal(second.createdAt, first.createdAt);
    assert.equal(getAdsConversionOutboxRow(db, "order_ads_008").status, "pending");
    assert.equal(
      db.prepare(`select count(*) from platform_ads_conversion_outbox`).pluck().get(),
      1
    );
  });
});
