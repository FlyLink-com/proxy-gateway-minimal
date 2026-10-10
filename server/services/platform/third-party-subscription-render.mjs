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

function sanitizeOriginalName(value) {
  return text(value).replace(CONTROL_CHAR_PATTERN, "").slice(0, 96);
}

function assignDisplayName({ countryCode, index, originalName, used }) {
  const country = text(countryCode).toUpperCase() || "OTHER";
  const prefix = `${THIRD_PARTY_NAME_MARKER} ${country} ${index}`;
  const original = sanitizeOriginalName(originalName);
  let base = original ? `${prefix} | ${original}` : prefix;
  base = base.replace(CONTROL_CHAR_PATTERN, "").trim().slice(0, 128);
  if (!base) base = prefix;
  let name = base;
  let suffix = 2;
  while (!name || used.has(name) || RESERVED_NAMES.has(name)) {
    const extra = `~${suffix}`;
    name = `${base.slice(0, Math.max(1, 128 - extra.length))}${extra}`;
    suffix += 1;
  }
  used.add(name);
  return name;
}

export function decorateThirdPartyServers(nodes, existingServers = []) {
  const used = new Set(
    (existingServers || []).map((server, index) => proxyDisplayName(server, index))
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
  if (text(tenant?.status).toLowerCase() !== "active") {
    return original;
  }
  const binding = findUsageBindingForTenant(state.platform?.controlStore, tenant?.id);
  const planId = resolveThirdPartyPlanId({
    plan: binding?.plan,
    trafficLimitBytes: binding?.trafficLimitBytes,
    tenantStatus: tenant?.status
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
