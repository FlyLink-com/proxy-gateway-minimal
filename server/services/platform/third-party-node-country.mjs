import countryCodes from "../../../shared/third-party-country-codes.json" with { type: "json" };

// Explicit display metadata only: never infer or rewrite protocol identity.
const COUNTRY_CODES = new Set(countryCodes);
const LEADING_FLAGS = /^(?:[\u{1f1e6}-\u{1f1ff}]{2}\s*)+/u;

export function isThirdPartyCountryCode(value) {
  return typeof value === "string" && (value === "OTHER" || COUNTRY_CODES.has(value));
}

export function stripThirdPartyLeadingFlags(label) {
  return label.trim().replace(LEADING_FLAGS, "").trim();
}

export function applyThirdPartyCountryFlag(label, country) {
  if (!isThirdPartyCountryCode(country)) return label;
  const unflagged = stripThirdPartyLeadingFlags(label).replace(
    /^(\[3P\] (?:[A-Z]{2}|OTHER) \d+ \| )(.*)$/u,
    (_match, prefix, original) => `${prefix}${stripThirdPartyLeadingFlags(original)}`
  );
  if (country === "OTHER") return unflagged;
  const flag = [...country].map(letter => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65)).join("");
  return unflagged ? `${flag} ${unflagged}` : flag;
}
