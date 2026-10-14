import countryCodes from "./third-party-country-codes.json";

const CODES = new Set<string>(countryCodes);
const COMMON = ["US", "JP", "SG", "HK", "TW", "KR", "GB", "DE", "FR", "CA", "AU"];
const countryNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["zh-Hans"], { type: "region" }) : null;
const orderedCodes = [...COMMON, ...countryCodes.filter((code) => !COMMON.includes(code))];
const LEADING_FLAGS = /^(?:[\u{1f1e6}-\u{1f1ff}]{2}\s*)+/u;

export function isNodeCountryCode(value: string) {
  return value === "OTHER" || CODES.has(value);
}

export function countryFlag(code: string): string {
  return CODES.has(code) ? Array.from(code, (letter) => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65)).join("") : "";
}

export const NODE_COUNTRY_OPTIONS = orderedCodes.map((code) => ({ value: code, label: `${countryFlag(code)} ${countryNames?.of(code) ?? code} · ${code}` }));

// Display metadata only. Unselected/cleared overrides preserve the old label.
export function withNodeCountryFlag(label: string, code?: string | null): string {
  if (!code || !isNodeCountryCode(code)) return label;
  const plain = label.trim().replace(LEADING_FLAGS, "").trim()
    .replace(/^(\[3P\] (?:[A-Z]{2}|OTHER) \d+ \| )(.*)$/u, (_match, prefix: string, original: string) => prefix + original.trim().replace(LEADING_FLAGS, "").trim());
  const flag = countryFlag(code);
  const result = `${flag ? `${flag} ` : ""}${plain}`.trim().slice(0, 128);
  return (/[\ud800-\udbff]$/.test(result) ? result.slice(0, -1) : result).trim();
}
