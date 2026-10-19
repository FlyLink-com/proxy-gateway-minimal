// Trusted, in-process metadata only. JSON/YAML and string property names cannot
// enable client routing. This never authorizes a server-side network probe.
export const DISTRIBUTION_CLIENT_ROUTING = Symbol("distributionClientRouting");

const PLANS = new Set(["monthly_basic", "monthly_plus", "yearly"]);
const NODE_ID = /^tpnode_[a-f0-9]{32}$/;
const DAY_MS = 86_400_000;
const rejected = () => Object.assign(new Error("Subscription distribution ordering rejected"), {
  code: "invalid_subscription_distribution_rotation"
});

// Call only after stable display-name decoration, and only when the operator
// enabled daily ordering. No timer, persistence, credentials or traffic changes.
export function rotateSubscriptionDistributionServers(servers, options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw rejected();
  const { planId, at } = options;
  if (!PLANS.has(planId) || !(at instanceof Date || typeof at === "string" || typeof at === "number")
    || (typeof at === "string" && !at.trim()) || (typeof at === "number" && !Number.isFinite(at))) throw rejected();
  const instant = new Date(at).getTime();
  if (!Number.isFinite(instant) || !Array.isArray(servers) || servers.length < 1 || servers.length > 256) throw rejected();
  const seen = new Set();
  for (const server of servers) {
    if (!server || typeof server !== "object" || Array.isArray(server) || server.thirdParty !== true
      || typeof server.id !== "string" || !NODE_ID.test(server.id) || seen.has(server.id)) throw rejected();
    seen.add(server.id);
  }
  const ordered = [...servers].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const day = Math.floor(instant / DAY_MS);
  const offset = ((day % ordered.length) + ordered.length) % ordered.length;
  return [...ordered.slice(offset), ...ordered.slice(0, offset)];
}
