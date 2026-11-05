import assert from "node:assert/strict";
import test from "node:test";

import { inspectAdsClickLogEntries } from "../services/platform/ads-log-redaction-probe.mjs";

const SENTINELS = [
  "SYNTHETIC_GCLID_SENTINEL_816_A",
  "SYNTHETIC_WBRAID_SENTINEL_816_B"
];

test("redacted synthetic log fixtures pass without exposing sentinel values", () => {
  const result = inspectAdsClickLogEntries({
    entries: [
      "GET /checkout 200",
      "GET /api/portal/commerce/orders 201",
      "referer=https://example.invalid/landing"
    ],
    syntheticIdentifiers: SENTINELS
  });
  assert.equal(result.passed, true);
  assert.equal(result.matchedIdentifierCount, 0);
  assert.equal(JSON.stringify(result).includes(SENTINELS[0]), false);
  assert.equal(JSON.stringify(result).includes(SENTINELS[1]), false);
});

test("raw query strings and Referer values are detected in synthetic log fixtures", () => {
  const result = inspectAdsClickLogEntries({
    entries: [
      `GET /landing?gclid=${SENTINELS[0]} 200`,
      `referer=https://example.invalid/?wbraid=${SENTINELS[1]}`
    ],
    syntheticIdentifiers: SENTINELS
  });
  assert.equal(result.passed, false);
  assert.equal(result.matchedIdentifierCount, 2);
  assert.ok(result.matchCount >= 2);
  assert.equal(JSON.stringify(result).includes(SENTINELS[0]), false);
});

test("fully percent-encoded valid click IDs and base64 variants are detected without returning values", () => {
  const raw = SENTINELS[0];
  const percentEncoded = Array.from(Buffer.from(SENTINELS[1], "utf8"), (byte) => (
    `%${byte.toString(16).padStart(2, "0")}`
  )).join("");
  const base64 = Buffer.from(raw, "utf8").toString("base64");
  const base64url = Buffer.from(raw, "utf8").toString("base64url");
  const hex = Buffer.from(SENTINELS[1], "utf8").toString("hex");
  const result = inspectAdsClickLogEntries({
    entries: [
      `url=${base64}`,
      `referer=${percentEncoded}`,
      `telemetry=${base64url}`,
      `path=${hex}`
    ],
    syntheticIdentifiers: SENTINELS
  });
  assert.equal(result.passed, false);
  assert.equal(result.matchedIdentifierCount, 2);
  assert.equal(result.matchCount, 3);
  for (const value of [base64, base64url, percentEncoded, hex]) {
    assert.equal(JSON.stringify(result).includes(value), false);
  }
});

test("probe rejects empty entry and sentinel collections instead of passing zero coverage", () => {
  assert.throws(() => inspectAdsClickLogEntries({
    entries: [],
    syntheticIdentifiers: SENTINELS
  }), /entries must contain at least one string/);
  assert.throws(() => inspectAdsClickLogEntries({
    entries: ["safe"],
    syntheticIdentifiers: []
  }), /syntheticIdentifiers must contain at least one string/);
});

test("probe rejects non-exact input and short sentinel values", () => {
  assert.throws(() => inspectAdsClickLogEntries({
    entries: ["safe"],
    syntheticIdentifiers: ["short"],
    extra: true
  }), /exact/);
  assert.throws(() => inspectAdsClickLogEntries({
    entries: ["safe"],
    syntheticIdentifiers: ["short"]
  }), /invalid string/);
});
