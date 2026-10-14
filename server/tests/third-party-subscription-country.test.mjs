import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import countryCodes from "../../shared/third-party-country-codes.json" with { type: "json" };
import { applyThirdPartyCountryFlag, isThirdPartyCountryCode } from "../services/platform/third-party-node-country.mjs";
import { decorateThirdPartyServers } from "../services/platform/third-party-subscription-render.mjs";

test("country allowlist is shared, finite, unique and included in publish manifest", () => {
  assert.equal(countryCodes.length, 249);
  assert.equal(new Set(countryCodes).size, 249);
  assert.deepEqual(countryCodes, [...countryCodes].sort());
  for (const code of countryCodes) {
    assert.match(code, /^[A-Z]{2}$/);
    assert.equal(isThirdPartyCountryCode(code), true);
    const label = applyThirdPartyCountryFlag("Node", code);
    assert.equal([...label.slice(0, -5)].length, 2);
    assert.ok(label.isWellFormed());
  }
  assert.equal(isThirdPartyCountryCode("OTHER"), true);
  for (const code of ["ZZ", "UK", "XK", "AA", "EU", "JP ", null, undefined, 1]) assert.equal(isThirdPartyCountryCode(code), false);
  const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.ok(manifest.files.includes("shared/third-party-country-codes.json"));
});

test("Admin-local country allowlist mirrors the canonical backend list exactly", () => {
  const adminCodes = JSON.parse(readFileSync(new URL("../../admin/src/features/third-party-node-names/third-party-country-codes.json", import.meta.url), "utf8"));
  assert.equal(adminCodes.length, 249);
  assert.equal(new Set(adminCodes).size, 249);
  assert.deepEqual(adminCodes, countryCodes);
});

test("explicit flag override strips existing flags without touching middle-of-name flags", () => {
  assert.equal(applyThirdPartyCountryFlag("🇯🇵 🇺🇸 Node 🇬🇧", "SG"), "🇸🇬 Node 🇬🇧");
  assert.equal(applyThirdPartyCountryFlag("[3P] JP 1 | 🇯🇵 🇺🇸 Node", "SG"), "🇸🇬 [3P] JP 1 | Node");
  assert.equal(applyThirdPartyCountryFlag("[3P] JP 1 | 🇯🇵 Node", "OTHER"), "[3P] JP 1 | Node");
  assert.equal(applyThirdPartyCountryFlag("🇯🇵 Node", "ZZ"), "🇯🇵 Node");
});

test("OTHER with flag-only alias falls back to a usable default without introducing flags", () => {
  const rendered = decorateThirdPartyServers([{ name: "🇯🇵 Tokyo", countryCode: "JP", thirdPartyDisplayAlias: "🇯🇵🇺🇸", thirdPartyCountryOverride: "OTHER" }]);
  assert.equal(rendered[0].subscriptionDisplayName, "[3P] JP 1 | Tokyo");
});
