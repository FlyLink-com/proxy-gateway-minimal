import assert from "node:assert/strict";
import Database from "better-sqlite3";
import test from "node:test";
import { createSqliteAdsConsentStore } from "../services/platform/ads-consent-store.mjs";
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

function grantDefaultConsent(db) {
  const consent = createSqliteAdsConsentStore({
    database: db,
    env: ENABLED,
    nowFn: () => NOW
  });
  consent.recordConsent({ accountRef: "account_ads_001", adUserData: true });
  consent.close();
}

function capture(db, overrides = {}) {
  grantDefaultConsent(db);
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

test("validateAdsClick rejects impossible calendar dates that Date.parse would normalize", () => {
  // Each value below parses to a real instant inside the 90-day window,
  // so only the toISOString round-trip check can reject it.
  const feb30Now = Date.parse("2026-03-05T00:00:00.000Z");
  assert.equal(
    validateAdsClick(validClick({ clickAt: "2026-02-30T23:59:00.000Z" }), feb30Now),
    null
  );
  assert.equal(
    validateAdsClick(validClick({ clickAt: "2026-10-30T24:00:00.000Z" }), NOW),
    null
  );
  assert.equal(
    validateAdsClick(validClick({ clickAt: "2026-13-01T00:00:00.000Z" }), NOW),
    null
  );
  // A real leap day round-trips exactly and is accepted.
  const leapNow = Date.parse("2028-03-01T00:00:00.000Z");
  const leap = validateAdsClick(
    validClick({ clickAt: "2028-02-29T12:00:00.000Z" }),
    leapNow
  );
  assert.equal(leap.clickAt, Date.parse("2028-02-29T12:00:00.000Z"));
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

test("claims are tri-state: absent descriptor is no_click, malformed descriptor is invalid_click", () => {
  withDb((db) => {
    // No adsClick field at all: the only shape that may be recorded as
    // a definite no_click.
    const binding = capture(db, { adsClick: undefined });
    assert.equal(binding, null);
    const noClick = getAdsClickClaim(db, "order_ads_001");
    assert.equal(noClick.claimState, "no_click");
    assert.equal(noClick.hasClick, false);
    assert.equal(noClick.clickValue, null);
    // A descriptor that was carried but failed validation is a
    // different, definite fact: invalid_click. It must never be folded
    // into the no-click statistics.
    const binding2 = safeCaptureAdsClickForOrder(db, {
      orderRef: "order_ads_002",
      accountRef: "account_ads_001",
      model: "legacy",
      adsClick: validClick({ value: "bad value" })
    }, { env: ENABLED, now: NOW });
    assert.equal(binding2, null);
    const invalid = getAdsClickClaim(db, "order_ads_002");
    assert.equal(invalid.claimState, "invalid_click");
    assert.equal(invalid.hasClick, false);
    assert.equal(invalid.clickValue, null);
    // Every malformed shape lands in invalid_click, including a null
    // descriptor, a bad type, a non-boolean consent, and an unusable
    // clickAt; none of them stores descriptor fields.
    const malformed = [
      null,
      "gclid",
      validClick({ type: "dclid" }),
      validClick({ consent: { adUserData: "yes", adPersonalization: false } }),
      validClick({ clickAt: "2026-10-30T23:59:00" }),
      validClick({ clickAt: NOW + 1_000 })
    ];
    malformed.forEach((adsClick, index) => {
      const orderRef = `order_ads_1${String(index).padStart(2, "0")}`;
      safeCaptureAdsClickForOrder(db, {
        orderRef,
        accountRef: "account_ads_001",
        model: "legacy",
        adsClick
      }, { env: ENABLED, now: NOW });
      const claim = getAdsClickClaim(db, orderRef);
      assert.equal(claim.claimState, "invalid_click", JSON.stringify(adsClick));
      assert.equal(claim.clickType, null);
      assert.equal(claim.clickAt, null);
      assert.equal(getAdsClickBinding(db, orderRef), null);
    });
    // A valid descriptor is the 'click' state.
    const valid = capture(db, { orderRef: "order_ads_199" });
    assert.equal(valid.clickValue, "EAIaIQobChMI-test_click.001");
    assert.equal(
      getAdsClickClaim(db, "order_ads_199").claimState,
      "click"
    );
  });
});

test("replay materialization uses only the stored claim, never the replay's descriptor", () => {
  withDb((db) => {
    grantDefaultConsent(db);
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
    grantDefaultConsent(db);
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

test("enqueueAdsConversion records skipped/claim_missing when no claim was ever recorded, in Coins", () => {
  withDb((db) => {
    // No claim row exists for this order: whether the first request
    // carried a click is unknown, so the outcome is claim_missing and
    // must not be reported as a definite no_click.
    const row = enqueueAdsConversion(db, {
      orderRef: "order_ads_008",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW
    }, { env: ENABLED, now: NOW });
    assert.equal(row.status, "skipped");
    assert.equal(row.skipReason, "claim_missing");
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

test("enqueueAdsConversion records skipped/no_click for an explicit no-click claim", () => {
  withDb((db) => {
    recordAdsClickClaim(db, {
      orderRef: "order_ads_021",
      accountRef: "account_ads_001",
      model: "legacy",
      adsClick: undefined
    }, { env: ENABLED, now: NOW });
    const row = enqueueAdsConversion(db, {
      orderRef: "order_ads_021",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW
    }, { env: ENABLED, now: NOW });
    assert.equal(row.status, "skipped");
    assert.equal(row.skipReason, "no_click");
  });
});

test("enqueueAdsConversion records skipped/binding_failed when the claim has a click but no binding materialized", () => {
  withDb((db) => {
    grantDefaultConsent(db);
    recordAdsClickClaim(db, {
      orderRef: "order_ads_022",
      accountRef: "account_ads_001",
      model: "deferred",
      adsClick: validClick()
    }, { env: ENABLED, now: NOW });
    // Raw enqueue without a preceding materialization: the click is
    // known to exist, so this is a recoverable binding failure, not a
    // missing click.
    const row = enqueueAdsConversion(db, {
      orderRef: "order_ads_022",
      model: "deferred",
      valueUnits: 30,
      terminalAt: NOW
    }, { env: ENABLED, now: NOW });
    assert.equal(row.status, "skipped");
    assert.equal(row.skipReason, "binding_failed");
    // Once the binding materializes, the same row upgrades to pending.
    materializeAdsClickBinding(db, {
      orderRef: "order_ads_022"
    }, { env: ENABLED, now: NOW + 1_000 });
    const upgraded = enqueueAdsConversion(db, {
      orderRef: "order_ads_022",
      model: "deferred",
      valueUnits: 30,
      terminalAt: NOW + 1_000
    }, { env: ENABLED, now: NOW + 1_000 });
    assert.equal(upgraded.status, "pending");
    assert.equal(upgraded.skipReason, null);
  });
});

test("enqueueAdsConversion records skipped/invalid_click for a malformed-descriptor claim", () => {
  withDb((db) => {
    safeCaptureAdsClickForOrder(db, {
      orderRef: "order_ads_023",
      accountRef: "account_ads_001",
      model: "legacy",
      adsClick: validClick({ value: "bad value" })
    }, { env: ENABLED, now: NOW });
    assert.equal(
      getAdsClickClaim(db, "order_ads_023").claimState,
      "invalid_click"
    );
    const row = enqueueAdsConversion(db, {
      orderRef: "order_ads_023",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW
    }, { env: ENABLED, now: NOW });
    assert.equal(row.status, "skipped");
    assert.equal(row.skipReason, "invalid_click");
    // An invalid click never materializes a binding, so the row can
    // never be upgraded by a later "corrected" descriptor.
    assert.equal(getAdsClickBinding(db, "order_ads_023"), null);
  });
});

test("safeEnqueue records binding_failed through the real entry point when only binding writes fail, then upgrades", () => {
  withDb((db) => {
    grantDefaultConsent(db);
    // A valid claim is recorded while all tables are writable.
    recordAdsClickClaim(db, {
      orderRef: "order_ads_024",
      accountRef: "account_ads_001",
      model: "legacy",
      adsClick: validClick()
    }, { env: ENABLED, now: NOW });
    // Only the bindings table becomes unwritable; claims and outbox
    // stay writable. The safe entry point must not throw, and the
    // materialization failure must not swallow the enqueue: the outbox
    // row records the recoverable binding_failed outcome.
    db.exec(`
      create trigger ads_test_fail_bindings_insert
        before insert on platform_ads_click_bindings
        begin select raise(abort, 'synthetic binding write failure'); end;
      create trigger ads_test_fail_bindings_update
        before update on platform_ads_click_bindings
        begin select raise(abort, 'synthetic binding write failure'); end;
    `);
    const failed = safeEnqueueAdsConversion(db, {
      orderRef: "order_ads_024",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW
    }, { env: ENABLED, now: NOW });
    assert.equal(failed.status, "skipped");
    assert.equal(failed.skipReason, "binding_failed");
    assert.equal(getAdsClickBinding(db, "order_ads_024"), null);
    // Once the fault clears, the same safe entry point materializes the
    // binding and upgrades the row to pending.
    db.exec(`
      drop trigger ads_test_fail_bindings_insert;
      drop trigger ads_test_fail_bindings_update;
    `);
    const recovered = safeEnqueueAdsConversion(db, {
      orderRef: "order_ads_024",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW + 1_000
    }, { env: ENABLED, now: NOW + 1_000 });
    assert.equal(recovered.status, "pending");
    assert.equal(recovered.skipReason, null);
    assert.equal(
      getAdsClickBinding(db, "order_ads_024").clickValue,
      "EAIaIQobChMI-test_click.001"
    );
  });
});

test("a failed claim write surfaces as claim_missing at the terminal step, never as no_click", () => {
  withDb((db) => {
    ensureAdsConversionSchema(db);
    db.exec(`
      create trigger ads_test_fail_claims_insert
        before insert on platform_ads_click_claims
        begin select raise(abort, 'synthetic claim write failure'); end;
    `);
    // The first request's capture fails silently: no claim row exists.
    const binding = safeCaptureAdsClickForOrder(db, {
      orderRef: "order_ads_025",
      accountRef: "account_ads_001",
      model: "legacy",
      adsClick: validClick()
    }, { env: ENABLED, now: NOW });
    assert.equal(binding, null);
    assert.equal(
      db.prepare(`select count(*) from platform_ads_click_claims`).pluck().get(),
      0
    );
    db.exec(`drop trigger ads_test_fail_claims_insert;`);
    // The terminal outcome is the unknown state, not a definite
    // no_click, even though the request did carry a click.
    const row = safeEnqueueAdsConversion(db, {
      orderRef: "order_ads_025",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW
    }, { env: ENABLED, now: NOW });
    assert.equal(row.status, "skipped");
    assert.equal(row.skipReason, "claim_missing");
  });
});

test("a failed outbox write is swallowed by the safe entry point and a later call fills the row", () => {
  withDb((db) => {
    capture(db, { orderRef: "order_ads_026" });
    db.exec(`
      create trigger ads_test_fail_outbox_insert
        before insert on platform_ads_conversion_outbox
        begin select raise(abort, 'synthetic outbox write failure'); end;
      create trigger ads_test_fail_outbox_update
        before update on platform_ads_conversion_outbox
        begin select raise(abort, 'synthetic outbox write failure'); end;
    `);
    const failed = safeEnqueueAdsConversion(db, {
      orderRef: "order_ads_026",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW
    }, { env: ENABLED, now: NOW });
    assert.equal(failed, null);
    assert.equal(getAdsConversionOutboxRow(db, "order_ads_026"), null);
    db.exec(`
      drop trigger ads_test_fail_outbox_insert;
      drop trigger ads_test_fail_outbox_update;
    `);
    const filled = safeEnqueueAdsConversion(db, {
      orderRef: "order_ads_026",
      model: "legacy",
      valueUnits: 20,
      terminalAt: NOW + 1_000
    }, { env: ENABLED, now: NOW + 1_000 });
    assert.equal(filled.status, "pending");
  });
});

test("client-declared denial is stored as a value-free invalid click claim", () => {
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
    assert.equal(row.skipReason, "invalid_click");
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
    grantDefaultConsent(db);
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
    assert.equal(bare.skipReason, "claim_missing");
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
    grantDefaultConsent(db);
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
    grantDefaultConsent(db);
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
