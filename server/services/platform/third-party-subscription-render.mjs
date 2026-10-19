import { proxyDisplayName } from "../proxy-display-name.mjs";
import { applyThirdPartyCountryFlag, isThirdPartyCountryCode } from "./third-party-node-country.mjs";
import { resolveThirdPartyPlanIdForTenant } from "./third-party-subscription-tier.mjs";

export const THIRD_PARTY_NAME_MARKER = "[3P]";
// Store-owned metadata cannot be forged by JSON/YAML node configuration.
export const THIRD_PARTY_NAME_INDEX = Symbol("thirdPartyNameIndex");
export const THIRD_PARTY_NAME_RESERVATIONS = Symbol("thirdPartyNameReservations");

const RESERVED_NAMES = new Set([
  "DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE",
  "GLOBAL", "AUTO", "STABLE", "WEAK-NETWORK", "FALLBACK"
]);

const CONTROL_CHAR_PATTERN =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/gu;

function text(value) {
  return String(value ?? "").trim();
}

function truncateLabel(value, limit) {
  const truncated = value.slice(0, limit);
  // Preserve well-formed Unicode when the UTF-16 bound falls inside an emoji.
  // Truncation can expose trailing whitespace: normalize before name deduping,
  // matching the final proxyDisplayName boundary rather than trimming later.
  return (/[\ud800-\udbff]$/.test(truncated) ? truncated.slice(0, -1) : truncated).trimEnd();
}

// A display projection only: keep encrypted upstream names and fingerprints intact.
// With the Unicode flag, this strips lone surrogates without stripping emoji pairs.
export function safeThirdPartyDisplayLabel(value, limit = 128) {
  return truncateLabel(text(value)
    .replace(CONTROL_CHAR_PATTERN, "")
    .replace(/[\ud800-\udfff]/gu, "")
    .trim(), limit);
}

function sanitizeOriginalName(value) {
  return safeThirdPartyDisplayLabel(value, 96);
}

function safeManagedAlias(value) {
  if (typeof value !== "string" || value.length > 128 || /[\ud800-\udfff]/u.test(value) ||
      /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(value)) return "";
  const alias = value.trim();
  return RESERVED_NAMES.has(alias.toUpperCase()) ? "" : alias;
}

export function thirdPartyDisplayNameBase({ countryCode, countryOverride, index, originalName, managedAlias }) {
  const country = text(countryCode).toUpperCase() || "OTHER";
  const prefix = `${THIRD_PARTY_NAME_MARKER} ${country} ${index}`;
  const original = sanitizeOriginalName(originalName);
  const defaultBase = original ? `${prefix} | ${original}` : prefix;
  let base = safeManagedAlias(managedAlias) || defaultBase;
  if (isThirdPartyCountryCode(countryOverride)) base = applyThirdPartyCountryFlag(base, countryOverride) || applyThirdPartyCountryFlag(defaultBase, countryOverride);
  base = truncateLabel(base.replace(CONTROL_CHAR_PATTERN, "").trim(), 128);
  return base || prefix;
}

function reserveDisplayName(base, used) {
  let name = base;
  let suffix = 2;
  while (!name || used.has(name.toUpperCase()) || RESERVED_NAMES.has(name.toUpperCase())) {
    const extra = `~${suffix}`;
    name = `${truncateLabel(base, Math.max(1, 128 - extra.length))}${extra}`;
    suffix += 1;
  }
  used.add(name.toUpperCase());
  return name;
}

function assignDisplayName({ used, ...inputs }) {
  return reserveDisplayName(thirdPartyDisplayNameBase(inputs), used);
}

export function decorateThirdPartyServers(nodes, existingServers = []) {
  const used = new Set(
    (existingServers || []).map((server, index) => proxyDisplayName(server, index).toUpperCase())
  );
  const counters = new Map();
  const decorated = [];
  for (const node of nodes || []) {
    const {
      [THIRD_PARTY_NAME_INDEX]: storedIndex,
      [THIRD_PARTY_NAME_RESERVATIONS]: reservations,
      thirdPartyNameIndex: _untrustedIndex,
      thirdPartyNameReservations: _untrustedReservations,
      ...server
    } = node;
    // Reserve only safe display bases from earlier paused/deleted rows. No
    // upstream material is required, and source order preserves collision suffixes.
    if (Array.isArray(reservations)) {
      for (const base of reservations) {
        if (typeof base === "string" && base && safeThirdPartyDisplayLabel(base) === base) {
          reserveDisplayName(base, used);
        }
      }
    }
    const countryOverride = isThirdPartyCountryCode(node.thirdPartyCountryOverride) ? node.thirdPartyCountryOverride : null;
    const country = text(node.countryCode || node.region).toUpperCase() || "OTHER";
    const sequential = (counters.get(country) || 0) + 1;
    const next = Number.isSafeInteger(storedIndex) && storedIndex >= sequential ? storedIndex : sequential;
    counters.set(country, next);
    const subscriptionDisplayName = assignDisplayName({
      countryCode: country,
      countryOverride,
      index: next,
      originalName: node.displayName || node.name,
      managedAlias: node.thirdPartyDisplayAlias,
      used
    });
    decorated.push({
      ...server,
      thirdParty: true,
      autoEligible: false,
      qualityClass: "",
      countryCode: country,
      subscriptionDisplayName
    });
  }
  return decorated;
}

export function applyThirdPartyProxyConfig(state, result) {
  const original = result?.proxyConfig;
  if (!original || typeof original !== "object") return original;
  // The authenticated core already selected the complete distribution route.
  if (result.distributionManaged === true) return original;
  const feature = state?.thirdPartySubscriptions;
  if (!feature?.enabled || feature.available !== true || !feature.store) {
    return original;
  }
  const tenant = result?.tenant;
  // The rendered HTTP path requires a known deliverable status.
  const tenantStatus = text(tenant?.status).toLowerCase();
  if (tenantStatus !== "active" && tenantStatus !== "expiring") {
    return original;
  }
  let planId;
  try {
    const now = typeof state.platform?.usageNowFn === "function"
      ? state.platform.usageNowFn() : new Date();
    const at = (now instanceof Date ? now : new Date(now)).toISOString();
    planId = resolveThirdPartyPlanIdForTenant(state.platform?.controlStore, tenant, { at });
  } catch {
    return original;
  }
  if (!planId) return original;
  let nodes;
  try {
    nodes = feature.store.listActiveServersForPlan(planId);
  } catch {
    return original;
  }
  if (!Array.isArray(nodes) || nodes.length === 0) return original;
  const existing = Array.isArray(original.servers) ? original.servers : [];
  return {
    ...original,
    servers: [...existing, ...decorateThirdPartyServers(nodes, existing)]
  };
}
