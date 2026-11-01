function exactStringArray(value, field, minimumLength = 1) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError(`${field} must be an array of strings`);
  }
  const values = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length < minimumLength) {
      throw new TypeError(`${field} contains an invalid string`);
    }
    values.push(item);
  }
  return values;
}

function reversibleVariants(identifier) {
  const encoded = encodeURIComponent(identifier);
  const encodedLower = encoded.replace(/%[0-9A-F]{2}/g, (part) => part.toLowerCase());
  const encodedTwice = encodeURIComponent(encoded);
  const base64 = Buffer.from(identifier, "utf8").toString("base64");
  const base64url = Buffer.from(identifier, "utf8").toString("base64url");
  const hex = Buffer.from(identifier, "utf8").toString("hex");
  return new Set([
    identifier,
    encoded,
    encodedLower,
    encodedTwice,
    base64,
    base64url,
    hex,
    hex.toUpperCase()
  ]);
}

/**
 * Checks only caller-supplied synthetic log fixtures. It never reads files,
 * accesses a logging provider, or returns sentinel values. Encodings covered
 * are raw text, URI percent encoding, base64, base64url, and UTF-8 hex.
 */
export function inspectAdsClickLogEntries(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new TypeError("input must be a plain object");
  }
  const keys = Reflect.ownKeys(input);
  if (keys.length !== 2 || !keys.includes("entries")
    || !keys.includes("syntheticIdentifiers")) {
    throw new TypeError("input fields must be exact");
  }
  const entries = exactStringArray(input.entries, "entries");
  const identifiers = exactStringArray(input.syntheticIdentifiers, "syntheticIdentifiers", 8);
  const haystack = entries.join("\n");
  let checkedVariantCount = 0;
  let matchCount = 0;
  let matchedIdentifierCount = 0;

  for (const identifier of new Set(identifiers)) {
    let matched = false;
    for (const variant of reversibleVariants(identifier)) {
      checkedVariantCount += 1;
      if (haystack.includes(variant)) {
        matchCount += 1;
        matched = true;
      }
    }
    if (matched) matchedIdentifierCount += 1;
  }

  return Object.freeze({
    schemaVersion: "1",
    checkedEntryCount: entries.length,
    checkedIdentifierCount: new Set(identifiers).size,
    checkedVariantCount,
    matchedIdentifierCount,
    matchCount,
    passed: matchCount === 0
  });
}
