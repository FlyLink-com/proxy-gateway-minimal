import assert from "node:assert/strict";
import Database from "better-sqlite3";
import test from "node:test";
import {
  adsBindingEnabled,
  enqueueAdsConversion,
  ensureAdsConversionSchema,
  getAdsClickBinding,
  getAdsClickClaim,
  getAdsConversionOutboxRow,
  materializeAdsClickBinding,
  recordAdsClickClaim,
  safeCaptureAdsClickForOrder,
  safeEnqueueAdsConversion,
  safeMaterializeAdsClickForOrder,
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

function capture(db, overrides = {}) {
  return safeCaptureAdsClickForOrder(db, {
    orderRef: "order_ads_001",
    accountRef: "account_ads_001",
    model: "legacy",
    adsClick: validClick(),
    ...overrides
  }, { env: ENABLED, now: NOW });
}

test("adsBindingEnabled defaults off and only accepts the true literal", () => {
  assert.equal(adsBindingEnabled({}), false);
  assert.equal(adsBindingEnabled({ ADS_CLICK_BINDING_ENABLED: "false" }), false);
  assert.equal(adsBindingEnabled({ ADS_CLICK_BINDING_ENABLED: "1" }), false);
  assert.equal(adsBindingEnabled({ ADS_CLICK_BINDING_ENABLED: "TRUE" }), false);
  assert.equal(adsBindingEnabled({ ADS_CLICK_BINDING_ENABLED: "true" }), true);
  assert.equal(adsBindingEnabled({ ADS_CLICK_BINDING_ENABLED: true }), true);
});

test("validateAdsClick normalizes strict UTC ISO and epoch ms for all click types", () => {
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

test("validateAdsClick rejects non-strict clickAt shapes", () => {
  const cases = [
    // Seconds quantity passed as an epoch number.
    Math.floor((NOW - 60_000) / 1000),
    // Fractional numbers are not epoch integers.
    NOW - 60_000.5,
    // Timezone-less ISO is interpreted in the process timezone: rejected.
    "2026-10-30T23:59:00.000",
    "2026-10-30T23:59:00",
    // Explicit offsets are not the strict UTC shape.
    "2026-10-30T23:59:00.000+00:00",
    // Missing millisecond precision.
    "2026-10-30T23:59:00Z",
    // Incomplete dates.
    "2026-10",
    "2026-10-30",
    // Impossible calendar values.
    "2026-13-30T23:59:00.000Z",
    // Plain garbage / numeric strings.
    "not-a-date",
    String(NOW - 60_000)
  ];
  for (const clickAt of cases) {
    assert.equal(
      validateAdsClick(validClick({ clickAt }), NOW),
      null,
      JSON.stringify(clickAt)
    );
  }
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

test("ensureAdsConversionSchema creates all three tables idempotently", () => {
  withDb((db) => {
    ensureAdsConversionSchema(db);
    ensureAdsConversionSchema(db);
    assert.deepEqual(tableNames(db), [
      "platform_ads_click_bindings",
      "platform_ads_click_claims",
      "platform_ads_conversion_outbox"
    ]);
  });
});

test("first request capture records the claim and materializes the binding", () => {
  withDb((db) => {
    const binding = capture(db);
    assert.equal(binding.clickType, "gclid");
    assert.equal(binding.clickValue, "EAIaIQobChMI-test_click.001");
    assert.equal(binding.clickAt, NOW - 60_000);
    assert.equal(binding.consentAdUserData, true);
    assert.equal(binding.consentAdPersonalization, false);
    const claim = getAdsClickClaim(db, "order_ads_001");
    assert.equal(claim.hasClick, true);
    assert.equal(claim.clickValue, "EAIaIQobChMI-test_click.001");
    assert.equal(claim.accountRef, "account_ads_001");
  });
});

test("the first claim wins: later claims never replace it", () => {
  withDb((db) => {
    capture(db);
    const binding = capture(db, {
      adsClick: validClick({ value: "ZZZ-different-click" })
    });
    assert.equal(binding.clickValue, "EAIaIQobChMI-test_click.001");
    assert.equal(getAdsClickClaim(db, "order_ads_001").clickValue,
      "EAIaIQobChMI-test_click.001");
    assert.equal(
      db.prepare(`select count(*) from platform_ads_click_claims`).pluck().get(),
      1
    );
    assert.equal(
      db.prepare(`select count(*) from platform_ads_click_bindings`).pluck().get(),
      1
    );
  });
});

test("a request without a usable descriptor records an explicit no-click claim", () => {
  withDb((db) => {
    const binding = capture(db, { adsClick: undefined });
    assert.equal(binding, null);
    const claim = getAdsClickClaim(db, "order_ads_001");
    assert.equal(claim.hasClick, false);
    assert.equal(claim.clickValue, null);
    // And a malformed descriptor is also a no-click claim, so a later
    // "corrected" replay cannot change what the first request declared.
    const binding2 = safeCaptureAdsClickForOrder(db, {
      orderRef: "order_ads_002",
      accountRef: "account_ads_001",
      model: "legacy",
      adsClick: validClick({ value: "bad value" })
    }, { env: ENABLED, now: NOW });
    assert.equal(binding2, null);
    assert.equal(getAdsClickClaim(db, "order_ads_002").hasClick, false);
  });
});

test("replay materialization uses only the stored claim, never the replay's descriptor", () => {
  withDb((db) => {
    // First request declared a click; simulate its binding never having
    // been materialized (claim recorded directly).
    recordAdsClickClaim(db, {
      orderRef: "order_ads_003",
      accountRef: "account_ads_001",
      model: "deferred",
      adsClick: validClick()
    }, { env: ENABLED, now: NOW });
    assert.equal(getAdsClickBinding(db, "order_ads_003"), null);
    // A replay carrying a DIFFERENT click materializes the claimed one.
    const binding = safeMaterializeAdsClickForOrder(db, {
      orderRef: "order_ads_003"
    }, { env: ENABLED, now: NOW + 1_000 });
    assert.equal(binding.clickValue, "EAIaIQobChMI-test_click.001");
    // A replay for an order with no claim at all creates nothing.
    const none = safeMaterializeAdsClickForOrder(db, {
      orderRef: "order_ads_404"
    }, { env: ENABLED, now: NOW });
    assert.equal(none, null);
    assert.equal(getAdsClickBinding(db, "order_ads_404"), null);
    // A replay for an order whose claim is no-click creates nothing.
    recordAdsClickClaim(db, {
      orderRef: "order_ads_004",
      accountRef: "account_ads_001",
      model: "legacy",
      adsClick: undefined
    }, { env: ENABLED, now: NOW });
    assert.equal(safeMaterializeAdsClickForOrder(db, {
      orderRef: "order_ads_004"
    }, { env: ENABLED, now: NOW }), null);
  });
});

test("materializeAdsClickBinding is idempotent and claim-driven", () => {
  withDb((db) => {
    recordAdsClickClaim(db, {
      orderRef: "order_ads_005",
      accountRef: "account_ads_001",
      model: "legacy",
      adsClick: validClick()
    }, { env: ENABLED, now: NOW });
    const first = materializeAdsClickBinding(db, {
      orderRef: "order_ads_005"
    }, { env: ENABLED, now: NOW });
    const second = materializeAdsClickBinding(db, {
      orderRef: "order_ads_005"
    }, { env: ENABLED, now: NOW + 5_000 });
    assert.deepEqual(second, first);
    assert.equal(
      db.prepare(`select count(*) from platform_ads_click_bindings`).pluck().get(),
      1
    );
  });
});

test("flag off makes every entry point a no-op with no tables created", () => {
  withDb((db) => {
    assert.equal(safeCaptureAdsClickForOrder(db, {
      orderRef: "order_ads_006",
      accountRef: "account_ads_001",
      model: "legacy",
      adsClick: validClick()
    }, { env: DISABLED, now: NOW }), null);
    assert.equal(safeMaterializeAdsClickForOrder(db, {
      orderRef: "order_ads_006"
    }, { env: DISABLED, now: NOW }), null);
    assert.equal(safeEnqueueAdsConversion(db, {
      orderRef: "order_ads_006",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW
    }, { env: DISABLED, now: NOW }), null);
    assert.equal(recordAdsClickClaim(db, {
      orderRef: "order_ads_006",
      accountRef: "account_ads_001",
      model: "legacy",
      adsClick: validClick()
    }, { env: DISABLED, now: NOW }), null);
    assert.equal(materializeAdsClickBinding(db, {
      orderRef: "order_ads_006"
    }, { env: DISABLED, now: NOW }), null);
    assert.equal(enqueueAdsConversion(db, {
      orderRef: "order_ads_006",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW
    }, { env: DISABLED, now: NOW }), null);
    assert.deepEqual(tableNames(db), []);
  });
});

test("safe wrappers return null instead of throwing when the database fails", () => {
  const brokenDb = {
    exec() { throw new Error("SQLITE_BUSY: database is locked"); },
    prepare() { throw new Error("SQLITE_BUSY: database is locked"); }
  };
  assert.equal(safeCaptureAdsClickForOrder(brokenDb, {
    orderRef: "order_ads_007",
    accountRef: "account_ads_001",
    model: "legacy",
    adsClick: validClick()
  }, { env: ENABLED, now: NOW }), null);
  assert.equal(safeMaterializeAdsClickForOrder(brokenDb, {
    orderRef: "order_ads_007"
  }, { env: ENABLED, now: NOW }), null);
  assert.equal(safeEnqueueAdsConversion(brokenDb, {
    orderRef: "order_ads_007",
    model: "legacy",
    valueUnits: 20,
    terminalAt: NOW
  }, { env: ENABLED, now: NOW }), null);
});

test("enqueueAdsConversion records skipped/no_click without a binding, in Coins", () => {
  withDb((db) => {
    const row = enqueueAdsConversion(db, {
      orderRef: "order_ads_008",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW
    }, { env: ENABLED, now: NOW });
    assert.equal(row.status, "skipped");
    assert.equal(row.skipReason, "no_click");
    assert.equal(row.transactionId, "order_ads_008");
    assert.equal(row.valueUnits, 20);
    assert.equal(row.valueUnit, "COIN");
    assert.equal(row.terminalAt, NOW);
    const raw = db.prepare(`
      select * from platform_ads_conversion_outbox where order_ref = ?
    `).get("order_ads_008");
    assert.equal(raw.value_unit, "COIN");
    assert.equal("currency" in raw, false);
  });
});

test("enqueueAdsConversion records skipped/consent_denied when ad user data consent is absent", () => {
  withDb((db) => {
    safeCaptureAdsClickForOrder(db, {
      orderRef: "order_ads_009",
      accountRef: "account_ads_001",
      model: "deferred",
      adsClick: validClick({
        consent: { adUserData: false, adPersonalization: false }
      })
    }, { env: ENABLED, now: NOW });
    const row = enqueueAdsConversion(db, {
      orderRef: "order_ads_009",
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
      ["legacy", "order_ads_010", 20],
      ["deferred", "order_ads_011", 200]
    ]) {
      safeCaptureAdsClickForOrder(db, {
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

test("a skipped row upgrades to pending once the binding materializes", () => {
  withDb((db) => {
    // Terminal arrives first (binding not yet materialized): skipped.
    recordAdsClickClaim(db, {
      orderRef: "order_ads_012",
      accountRef: "account_ads_001",
      model: "legacy",
      adsClick: validClick()
    }, { env: ENABLED, now: NOW });
    const skipped = safeEnqueueAdsConversion(db, {
      orderRef: "order_ads_012",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW
    }, { env: ENABLED, now: NOW });
    // safeEnqueue materializes from the claim before evaluating, so this
    // is already pending; use the raw enqueue to pin the upgrade path:
    assert.equal(skipped.status, "pending");
    const bare = enqueueAdsConversion(db, {
      orderRef: "order_ads_013",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW
    }, { env: ENABLED, now: NOW });
    assert.equal(bare.status, "skipped");
    assert.equal(bare.skipReason, "no_click");
    safeCaptureAdsClickForOrder(db, {
      orderRef: "order_ads_013",
      accountRef: "account_ads_001",
      model: "legacy",
      adsClick: validClick()
    }, { env: ENABLED, now: NOW });
    const upgraded = enqueueAdsConversion(db, {
      orderRef: "order_ads_013",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW + 2_000
    }, { env: ENABLED, now: NOW + 2_000 });
    assert.equal(upgraded.status, "pending");
    assert.equal(upgraded.skipReason, null);
    assert.equal(upgraded.terminalAt, NOW + 2_000);
    assert.equal(upgraded.createdAt, bare.createdAt);
    assert.equal(
      db.prepare(`select count(*) from platform_ads_conversion_outbox`).pluck().get(),
      2
    );
  });
});

test("a pending row is never downgraded by a later skipped evaluation", () => {
  withDb((db) => {
    safeCaptureAdsClickForOrder(db, {
      orderRef: "order_ads_014",
      accountRef: "account_ads_001",
      model: "legacy",
      adsClick: validClick()
    }, { env: ENABLED, now: NOW });
    const pending = enqueueAdsConversion(db, {
      orderRef: "order_ads_014",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW
    }, { env: ENABLED, now: NOW });
    assert.equal(pending.status, "pending");
    // Simulate the binding being unavailable at a later evaluation: the
    // existing pending row must survive untouched.
    db.prepare(`delete from platform_ads_click_bindings where order_ref = ?`)
      .run("order_ads_014");
    const after = enqueueAdsConversion(db, {
      orderRef: "order_ads_014",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW + 9_000
    }, { env: ENABLED, now: NOW + 9_000 });
    assert.equal(after.status, "pending");
    assert.equal(after.skipReason, null);
    assert.equal(after.terminalAt, NOW);
    assert.equal(after.createdAt, pending.createdAt);
  });
});

test("enqueueAdsConversion is idempotent per order", () => {
  withDb((db) => {
    safeCaptureAdsClickForOrder(db, {
      orderRef: "order_ads_015",
      accountRef: "account_ads_001",
      model: "legacy",
      adsClick: validClick()
    }, { env: ENABLED, now: NOW });
    const first = enqueueAdsConversion(db, {
      orderRef: "order_ads_015",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW
    }, { env: ENABLED, now: NOW });
    const second = enqueueAdsConversion(db, {
      orderRef: "order_ads_015",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW + 5_000
    }, { env: ENABLED, now: NOW + 5_000 });
    assert.equal(second.status, "pending");
    assert.equal(second.terminalAt, first.terminalAt);
    assert.equal(second.createdAt, first.createdAt);
    assert.equal(
      db.prepare(`select count(*) from platform_ads_conversion_outbox`).pluck().get(),
      1
    );
  });
});

test("recordAdsClickClaim rejects invalid references without writing", () => {
  withDb((db) => {
    assert.equal(recordAdsClickClaim(db, {
      orderRef: "order_ads_016",
      accountRef: "account_ads_001",
      model: "unknown",
      adsClick: validClick()
    }, { env: ENABLED, now: NOW }), null);
    assert.equal(recordAdsClickClaim(db, {
      orderRef: "bad ref!",
      accountRef: "account_ads_001",
      model: "legacy",
      adsClick: validClick()
    }, { env: ENABLED, now: NOW }), null);
    // Both calls are rejected before any schema or row is written.
    assert.deepEqual(tableNames(db), []);
  });
});
