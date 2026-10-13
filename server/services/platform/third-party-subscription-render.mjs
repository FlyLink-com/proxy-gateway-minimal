import { proxyDisplayName } from "../proxy-display-name.mjs";
import {
  findUsageBindingForTenant,
  resolveThirdPartyPlanId
} from "./third-party-subscription-tier.mjs";

export const THIRD_PARTY_NAME_MARKER = "[3P]";

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
  return /[\ud800-\udbff]$/.test(truncated) ? truncated.slice(0, -1) : truncated;
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

function assignDisplayName({ countryCode, index, originalName, managedAlias, used }) {
  const country = text(countryCode).toUpperCase() || "OTHER";
  const prefix = `${THIRD_PARTY_NAME_MARKER} ${country} ${index}`;
  const original = sanitizeOriginalName(originalName);
  let base = safeManagedAlias(managedAlias) || (original ? `${prefix} | ${original}` : prefix);
  base = truncateLabel(base.replace(CONTROL_CHAR_PATTERN, "").trim(), 128);
  if (!base) base = prefix;
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

export function decorateThirdPartyServers(nodes, existingServers = []) {
  const used = new Set(
    (existingServers || []).map((server, index) => proxyDisplayName(server, index).toUpperCase())
  );
  const counters = new Map();
  const decorated = [];
  for (const node of nodes || []) {
    const country = text(node.countryCode || node.region).toUpperCase() || "OTHER";
    const next = (counters.get(country) || 0) + 1;
    counters.set(country, next);
    const subscriptionDisplayName = assignDisplayName({
      countryCode: country,
      index: next,
      originalName: node.displayName || node.name,
      managedAlias: node.thirdPartyDisplayAlias,
      used
    });
    decorated.push({
      ...node,
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
  const binding = findUsageBindingForTenant(state.platform?.controlStore, tenant?.id);
  const planId = resolveThirdPartyPlanId({
    plan: binding?.plan,
    trafficLimitBytes: binding?.trafficLimitBytes,
    tenantStatus
  });
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
