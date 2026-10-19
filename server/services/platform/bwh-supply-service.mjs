import { createHash } from "node:crypto";

const PLANS = new Set(["monthly_basic", "monthly_plus", "yearly"]);
const STATES = new Set(["enabled", "paused", "transitioning", "failed", "unavailable"]);
const COLLECTORS = new Set(["running", "paused", "unknown"]);
const REVISION = /^[a-f0-9]{64}$/;
const NODE_ID = /^tpnode_[a-f0-9]{32}$/;
const STATUS_KEYS = ["revision", "state", "protocolsRunning", "collectorState", "nativeDistributionEnabled", "observedAt", "canPause", "canEnable"];
const UNAVAILABLE_REVISION = createHash("sha256").update("bwh-supply-unavailable-v1").digest("hex");
const PUBLIC_CODES = new Set(["invalid_input", "revision_conflict", "supply_busy", "third_party_required", "supply_unavailable", "supply_failed"]);
const failure = code => Object.assign(new Error("BWH supply operation rejected"), { code });
const unavailable = () => ({ revision: UNAVAILABLE_REVISION, state: "unavailable", protocolsRunning: 0,
  collectorState: "unknown", nativeDistributionEnabled: false, observedAt: null, canPause: false, canEnable: false });
function exact(value, keys) {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function validStatus(value, now, maxAgeMs) {
  if (!exact(value, STATUS_KEYS) || typeof value.revision !== "string" || !REVISION.test(value.revision)
    || !STATES.has(value.state) || !Number.isInteger(value.protocolsRunning) || value.protocolsRunning < 0 || value.protocolsRunning > 3
    || !COLLECTORS.has(value.collectorState) || typeof value.nativeDistributionEnabled !== "boolean"
    || typeof value.canPause !== "boolean" || typeof value.canEnable !== "boolean") return false;
  if (value.observedAt !== null) {
    if (typeof value.observedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value.observedAt)) return false;
    const at = Date.parse(value.observedAt);
    if (!Number.isFinite(at) || at > now || now - at > maxAgeMs) return false;
  } else if (["enabled", "paused"].includes(value.state)) return false;
  if (value.state === "enabled") {
    return value.protocolsRunning === 3 && value.collectorState === "running"
      && value.nativeDistributionEnabled && !value.canEnable;
  }
  if (value.state === "paused") {
    return value.protocolsRunning === 0 && value.collectorState === "paused"
      && !value.nativeDistributionEnabled && !value.canPause;
  }
  return !value.nativeDistributionEnabled && !value.canPause && !value.canEnable;
}

function allRoutesThirdParty(snapshot) {
  if (!snapshot || typeof snapshot.revision !== "string" || !REVISION.test(snapshot.revision)
    || !Array.isArray(snapshot.routes) || snapshot.routes.length !== PLANS.size
    || !Array.isArray(snapshot.candidates) || snapshot.candidates.length > 4096) return false;
  const candidates = new Map();
  for (const item of snapshot.candidates) {
    if (!item || typeof item.id !== "string" || !NODE_ID.test(item.id) || candidates.has(item.id)) return false;
    candidates.set(item.id, item);
  }
  const seen = new Set();
  return snapshot.routes.every(route => {
    if (!route || !PLANS.has(route.planId) || seen.has(route.planId) || route.mode !== "third-party"
      || !Array.isArray(route.nodeIds) || route.nodeIds.length < 1 || route.nodeIds.length > 256
      || new Set(route.nodeIds).size !== route.nodeIds.length) return false;
    seen.add(route.planId);
    return route.nodeIds.every(id => {
      const candidate = candidates.get(id);
      return typeof id === "string" && NODE_ID.test(id) && candidate?.enabled === true
        && candidate.sourceEnabled === true && Array.isArray(candidate.tiers) && candidate.tiers.includes(route.planId);
    });
  });
}

// The host is a locally constructed adapter, never request JSON. Its durable
// intent contract must persist pending before physical changes, and read it on
// every future process start. Real systemd/coverage proof belongs to that host.
export function createBwhSupplyService({ enabled = false, host, distributionStore,
  nowFn = () => new Date(), maxStatusAgeMs = 60_000 } = {}) {
  const featureEnabled = enabled === true;
  const configured = featureEnabled && host?.durableIntent === true
    && typeof host.readStatus === "function" && typeof host.setEnabled === "function"
    && typeof distributionStore?.getSnapshot === "function" && typeof nowFn === "function"
    && Number.isSafeInteger(maxStatusAgeMs) && maxStatusAgeMs > 0 && maxStatusAgeMs <= 60_000;
  let inFlight = false;
  let outcomeUnknown = false;
  let lastStatus = unavailable();

  function hostStatus() {
    if (!configured) return unavailable();
    try {
      const value = host.readStatus();
      const now = new Date(nowFn()).getTime();
      if (!Number.isFinite(now) || !validStatus(value, now, maxStatusAgeMs)) return unavailable();
      return Object.fromEntries(STATUS_KEYS.map(key => [key, value[key]]));
    } catch { return unavailable(); }
  }
  function policy() {
    try { return distributionStore.getSnapshot(); } catch { throw failure("supply_unavailable"); }
  }
  function transitioning(snapshot) {
    return { ...snapshot, state: "transitioning", nativeDistributionEnabled: false, canPause: false, canEnable: false };
  }
  function read() {
    if (inFlight) return transitioning(lastStatus);
    const snapshot = hostStatus();
    lastStatus = snapshot;
    // An explicit operator read is required to clear an ambiguous local result.
    // A persistent pending/unknown host can never be cleared by this read.
    if (outcomeUnknown && ["enabled", "paused"].includes(snapshot.state)) outcomeUnknown = false;
    if (outcomeUnknown) return { ...snapshot, state: snapshot.state === "transitioning" ? "transitioning" : "failed",
      nativeDistributionEnabled: false, canPause: false, canEnable: false };
    let canPause = snapshot.canPause;
    if (canPause) {
      try { canPause = allRoutesThirdParty(policy()); } catch { canPause = false; }
    }
    return { ...snapshot, canPause };
  }
  function allowsNativeDistribution() {
    if (!featureEnabled) return true;
    if (!configured || inFlight || outcomeUnknown) return false;
    try {
      if (typeof host.allowsNativeDistribution === "function") {
        // Concrete hosts read the durable intent and start guard here. This
        // path performs no sudo/systemctl or Admin full-catalog operation.
        return host.allowsNativeDistribution() === true;
      }
      const snapshot = hostStatus();
      return snapshot.state === "enabled" && snapshot.nativeDistributionEnabled;
    } catch { return false; }
  }
  async function setEnabled(input) {
    if (!exact(input, ["revision", "supplyRevision", "enabled"])
      || typeof input.revision !== "string" || !REVISION.test(input.revision)
      || typeof input.supplyRevision !== "string" || !REVISION.test(input.supplyRevision)
      || typeof input.enabled !== "boolean") throw failure("invalid_input");
    if (!configured) throw failure("supply_unavailable");
    if (inFlight || outcomeUnknown) throw failure("supply_busy");
    // Set before invoking any adapter or promise, so a second request cannot
    // slip into the same JavaScript turn and queue another host operation.
    inFlight = true;
    let hostInvoked = false;
    try {
      const beforePolicy = policy();
      if (beforePolicy?.revision !== input.revision) throw failure("revision_conflict");
      const beforeHost = hostStatus();
      lastStatus = beforeHost;
      if (beforeHost.state === "unavailable") throw failure("supply_unavailable");
      if (beforeHost.state === "transitioning") throw failure("supply_busy");
      if (beforeHost.revision !== input.supplyRevision) throw failure("revision_conflict");
      if (!input.enabled && !allRoutesThirdParty(beforePolicy)) throw failure("third_party_required");
      if ((input.enabled && !beforeHost.canEnable) || (!input.enabled && !beforeHost.canPause)) throw failure("supply_unavailable");
      hostInvoked = true;
      const action = host.setEnabled({ enabled: input.enabled, expectedRevision: input.supplyRevision });
      if (!action || typeof action.then !== "function") throw failure("supply_failed");
      const result = await action;
      const now = new Date(nowFn()).getTime();
      if (!Number.isFinite(now) || !validStatus(result, now, maxStatusAgeMs)
        || result.state !== (input.enabled ? "enabled" : "paused")) throw failure("supply_failed");
      const after = hostStatus();
      if (after.state !== result.state || after.revision !== result.revision
        || after.protocolsRunning !== result.protocolsRunning || after.collectorState !== result.collectorState
        || after.nativeDistributionEnabled !== result.nativeDistributionEnabled) throw failure("supply_failed");
      const afterPolicy = policy();
      if (afterPolicy?.revision !== beforePolicy.revision || (!input.enabled && !allRoutesThirdParty(afterPolicy))) throw failure("supply_failed");
      lastStatus = after;
      return { ...after };
    } catch (error) {
      if (hostInvoked) {
        outcomeUnknown = true;
        lastStatus = { ...lastStatus, state: "failed", nativeDistributionEnabled: false, canPause: false, canEnable: false };
        throw failure("supply_failed");
      }
      throw failure(PUBLIC_CODES.has(error?.code) ? error.code : "supply_unavailable");
    } finally { inFlight = false; }
  }
  function isTransitioning() {
    return inFlight || outcomeUnknown || (configured && hostStatus().state === "transitioning");
  }
  return { enabled: featureEnabled, available: configured, read, allowsNativeDistribution, setEnabled, isTransitioning };
}
